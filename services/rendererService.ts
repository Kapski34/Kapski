import * as THREE from 'three';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { ThreeMFLoader } from 'three/addons/loaders/3MFLoader.js';

// Let TypeScript know about the JSZip global variable from the script tag in index.html
declare const JSZip: any;

const RENDER_WIDTH = 1024;
const RENDER_HEIGHT = 1024;

interface ModelDimensions {
    x: number;
    y: number;
    z: number;
}

interface RenderResult {
    images: File[];
    dimensions: ModelDimensions;
    weight: number | null; // in kilograms
}

/**
 * Extracts the estimated print weight from slicer metadata embedded within a .3mf file.
 * It searches for common metadata keys used by slicers like PrusaSlicer or Bambu Studio
 * by checking multiple patterns (XML metadata tags and XML comments).
 * @param modelXmlText The XML content of the .model file as a string.
 * @returns The weight in grams if found, otherwise null.
 */
const getWeightFromMetadata = (modelXmlText: string): number | null => {
    // A list of robust regex patterns to find the weight in various formats.
    const weightPatterns = [
        // Pattern for <metadata name="namespace:total_weight" ...>12.34</metadata>
        /<metadata name="[^"]*?(?:total_weight|filament_used_g|weight)"[^>]*>([0-9.]+)<\/metadata>/i,
        // Pattern for <!-- total_weight = 12.34 --> (used by some slicers)
        /<!--\s*(?:total_weight|filament_used_g)\s*=\s*([0-9.]+)\s*-->/i,
    ];

    for (const pattern of weightPatterns) {
        const match = modelXmlText.match(pattern);
        if (match && match[1]) {
            const weight = parseFloat(match[1]);
            if (!isNaN(weight)) {
                return weight;
            }
        }
    }
    return null;
};

interface ModelMetrics {
    dimensions: ModelDimensions;
    weight: number | null;
}

// Assumes PLA density in g/mm^3 (1.24 g/cm^3 -> 0.00124 g/mm^3)
const PLA_DENSITY_G_PER_MM3 = 0.00124;

/**
 * Manually parses a .3mf file by unzipping it and reading the XML to extract
 * accurate dimensions and calculate volume-based weight. This method is highly reliable.
 * It iterates through all meshes in the file, making it robust for complex models.
 * @param modelFile The .3mf file.
 * @returns A promise resolving to the model's metrics.
 */
const getMetricsFrom3mf = async (modelFile: File): Promise<ModelMetrics> => {
    try {
        const zip = await JSZip.loadAsync(modelFile);
        
        let modelEntry: any; // Using `any` to avoid type conflicts with JSZipObject

        // --- STEP 1: Find the main .model file using the official .rels file. ---
        const relsFile = zip.file("_rels/.rels");
        if (relsFile) {
            try {
                const relsXmlText = await relsFile.async('text');
                const relsParser = new DOMParser();
                const relsXmlDoc = relsParser.parseFromString(relsXmlText, "application/xml");
                const relationships = relsXmlDoc.getElementsByTagName("Relationship");
                let modelPath = null;
                for (let i = 0; i < relationships.length; i++) {
                    const type = relationships[i].getAttribute("Type");
                    if (type && type.endsWith("/3dmodel")) {
                        modelPath = relationships[i].getAttribute("Target");
                        break;
                    }
                }

                if (modelPath) {
                    const cleanModelPath = modelPath.startsWith('/') ? modelPath.substring(1) : modelPath;
                    modelEntry = zip.file(cleanModelPath);
                }
            } catch (e) {
                console.warn("Could not parse _rels/.rels file, falling back to standard search.", e);
            }
        }

        // --- STEP 2: If .rels parsing failed or the file is missing, use fallback methods. ---
        if (!modelEntry) {
            modelEntry = zip.file("3D/3dmodel.model");
        }
        
        if (!modelEntry) {
            const modelEntries = zip.file(/^(?!__MACOSX\/).*\.model$/i);
            if (modelEntries.length > 0) {
                 modelEntry = modelEntries.length === 1 ? modelEntries[0] : 
                    (await Promise.all(modelEntries.map(async (entry: any) => ({ entry, size: (await entry.async('blob')).size }))))
                    .sort((a, b) => b.size - a.size)[0].entry;
            }
        }

        if (!modelEntry) {
            throw new Error("Could not find a .model file in the 3MF archive.");
        }

        const modelXmlText = await modelEntry.async('text');
        
        // Attempt to get slicer-provided weight first, as it's the most accurate.
        const weightFromMetadata = getWeightFromMetadata(modelXmlText);
        
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(modelXmlText, "application/xml");

        if (xmlDoc.getElementsByTagName("parsererror").length > 0) {
            throw new Error("Failed to parse the model's XML file. It may be corrupt.");
        }
        
        let minX = Infinity, minY = Infinity, minZ = Infinity;
        let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
        let totalVolume = 0.0;
        let foundVertices = false;

        // Per the 3MF spec, geometry is defined inside <mesh> elements. Iterate through all of them.
        const meshNodes = xmlDoc.getElementsByTagNameNS('*', 'mesh');

        for (let m = 0; m < meshNodes.length; m++) {
            const meshNode = meshNodes[m];
            
            const verticesContainer = meshNode.getElementsByTagNameNS('*', 'vertices')[0];
            if (!verticesContainer) continue;

            const vertexNodes = verticesContainer.getElementsByTagNameNS('*', 'vertex');
            if (vertexNodes.length === 0) continue;
            
            foundVertices = true;

            const currentMeshVertices: { x: number; y: number; z: number }[] = [];
            for (let i = 0; i < vertexNodes.length; i++) {
                const v = vertexNodes[i];
                const x = parseFloat(v.getAttribute('x')!);
                const y = parseFloat(v.getAttribute('y')!);
                const z = parseFloat(v.getAttribute('z')!);

                if (isNaN(x) || isNaN(y) || isNaN(z)) continue;

                if (x < minX) minX = x; if (y < minY) minY = y; if (z < minZ) minZ = z;
                if (x > maxX) maxX = x; if (y > maxY) maxY = y; if (z > maxZ) maxZ = z;

                currentMeshVertices.push({ x, y, z });
            }
            
            const trianglesContainer = meshNode.getElementsByTagNameNS('*', 'triangles')[0];
            if (trianglesContainer) {
                const triangleNodes = trianglesContainer.getElementsByTagNameNS('*', 'triangle');
                let meshVolume = 0.0;
                for (let i = 0; i < triangleNodes.length; i++) {
                    const t = triangleNodes[i];
                    const v1_idx = parseInt(t.getAttribute('v1')!, 10);
                    const v2_idx = parseInt(t.getAttribute('v2')!, 10);
                    const v3_idx = parseInt(t.getAttribute('v3')!, 10);
                    
                    if (v1_idx >= currentMeshVertices.length || v2_idx >= currentMeshVertices.length || v3_idx >= currentMeshVertices.length) continue;

                    const p1 = currentMeshVertices[v1_idx];
                    const p2 = currentMeshVertices[v2_idx];
                    const p3 = currentMeshVertices[v3_idx];
                    
                    meshVolume += (-p3.x*p2.y*p1.z + p2.x*p3.y*p1.z + p3.x*p1.y*p2.z - p1.x*p3.y*p2.z - p2.x*p1.y*p3.z + p1.x*p2.y*p3.z) / 6.0;
                }
                totalVolume += meshVolume;
            }
        }
        
        if (!foundVertices) {
             throw new Error("No vertices found in the model file. The file may be empty or use a non-standard XML format.");
        }

        const dimensions: ModelDimensions = {
            x: maxX - minX,
            y: maxY - minY,
            z: maxZ - minZ
        };

        let calculatedWeight: number | null = null;
        if (weightFromMetadata === null) {
            calculatedWeight = Math.abs(totalVolume) * PLA_DENSITY_G_PER_MM3;
        }

        const finalWeightGrams = weightFromMetadata ?? calculatedWeight;

        return {
            dimensions,
            weight: finalWeightGrams !== null ? finalWeightGrams / 1000 : null, // Convert to KG
        };

    } catch (error) {
        console.error("Error manually parsing 3MF file for metrics:", error);
        throw error; // Re-throw to be caught by the main function
    }
};

/**
 * Manually computes the bounding box and dimensions of a THREE.BufferGeometry
 * by asking Three.js to compute it directly on the geometry data, which is
 * more reliable than using scene-based methods.
 * @param geometry The THREE.BufferGeometry to measure.
 * @returns The dimensions of the model.
 */
const getDimensionsFromGeometry = (geometry: THREE.BufferGeometry): ModelDimensions => {
    geometry.computeBoundingBox();
    if (!geometry.boundingBox) {
        throw new Error("Three.js could not compute a bounding box for the STL geometry. The file might be empty or corrupt.");
    }
    const size = new THREE.Vector3();
    geometry.boundingBox.getSize(size);
    if (size.x === 0 && size.y === 0 && size.z === 0) {
        throw new Error("The calculated dimensions for the STL model are zero. The file might be empty or invalid.");
    }
    return { x: size.x, y: size.y, z: size.z };
};

/**
 * Calculates the volume of a non-indexed BufferGeometry by summing the signed
 * volumes of tetrahedrons formed by each triangle and the origin.
 * @param geometry The THREE.BufferGeometry, expected to be non-indexed (like from STLLoader).
 * @returns The calculated volume of the mesh.
 */
const getVolumeFromGeometry = (geometry: THREE.BufferGeometry): number => {
    if (!geometry.isBufferGeometry || !geometry.attributes.position) {
        console.warn('Volume calculation requires a BufferGeometry with a position attribute.');
        return 0;
    }
    
    const positions = geometry.attributes.position.array;
    let volume = 0.0;

    for (let i = 0; i < positions.length; i += 9) {
        const p1x = positions[i], p1y = positions[i+1], p1z = positions[i+2];
        const p2x = positions[i+3], p2y = positions[i+4], p2z = positions[i+5];
        const p3x = positions[i+6], p3y = positions[i+7], p3z = positions[i+8];
        
        // Signed volume of a tetrahedron (determinant of 3 vectors)
        volume += (
            -p3x * p2y * p1z + p2x * p3y * p1z +
             p3x * p1y * p2z - p1x * p3y * p2z -
             p2x * p1y * p3z + p1x * p2y * p3z
        ) / 6.0;
    }

    return Math.abs(volume);
}

/**
 * Generates images from a 3D model, calculates its dimensions, and extracts weight if available.
 * It uses dedicated, robust methods for each file type (.3mf and .stl) to ensure accuracy
 * by analyzing file data directly before rendering begins.
 * @param modelFile The .stl or .3mf file to process.
 * @returns A promise resolving to an object with images, dimensions, and possibly weight.
 */
export const generateImagesFromModel = async (modelFile: File): Promise<RenderResult> => {
    let dimensions: ModelDimensions;
    let weight: number | null;
    let objectToFrame: THREE.Object3D;
    const geometriesToDispose: THREE.BufferGeometry[] = [];
    const materialsToDispose: THREE.Material[] = [];
    
    // A high-quality default material for monochrome models (STL).
    const stlMaterial = new THREE.MeshStandardMaterial({
        color: 0xcccccc, 
        metalness: 0.2,
        roughness: 0.5,
    });
    materialsToDispose.push(stlMaterial);
    
    const fileBuffer = await modelFile.arrayBuffer();

    // --- Step 1: Load Model and Get Metrics using file-specific reliable methods ---
    if (modelFile.name.toLowerCase().endsWith('.3mf')) {
        const metrics = await getMetricsFrom3mf(modelFile);
        dimensions = metrics.dimensions;
        weight = metrics.weight;

        const loader = new ThreeMFLoader();
        objectToFrame = loader.parse(fileBuffer);

        // CRITICAL FIX: Do NOT override materials for 3MF files.
        // The 3MFLoader is smart enough to create its own materials based on the file content
        // (including vertex colors, base colors, etc.). Overriding them destroys color information.
        // We only traverse to collect geometries and materials for later disposal.
        objectToFrame.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                geometriesToDispose.push(child.geometry);
                if (Array.isArray(child.material)) {
                    materialsToDispose.push(...child.material);
                } else {
                    materialsToDispose.push(child.material);
                }
            }
        });
    } else { // Handle .stl
        const loader = new STLLoader();
        const geometry = loader.parse(fileBuffer) as THREE.BufferGeometry;
        geometriesToDispose.push(geometry);
        geometry.computeVertexNormals();
        
        // Calculate dimensions and weight directly from the geometry data. This is robust.
        dimensions = getDimensionsFromGeometry(geometry);
        const volume = getVolumeFromGeometry(geometry); // volume in mm^3
        const weightInGrams = volume * PLA_DENSITY_G_PER_MM3;
        weight = weightInGrams / 1000; // Convert to KG

        objectToFrame = new THREE.Mesh(geometry, stlMaterial);
    }
    
    // --- Reorient dimensions for sales context ---
    // The "height" should always be the largest dimension, regardless of model orientation in the file.
    const sortedDims = [dimensions.x, dimensions.y, dimensions.z].sort((a, b) => b - a);
    dimensions = {
        x: sortedDims[1], // width (middle value)
        y: sortedDims[0], // height (largest value)
        z: sortedDims[2], // depth (smallest value)
    };
    
    if (!objectToFrame) {
        throw new Error('Model file could not be parsed or loaded by Three.js.');
    }

    // --- Step 2: Setup Scene and Renderer for taking pictures ---
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xffffff); // White background for a clean, professional look
    const camera = new THREE.PerspectiveCamera(50, RENDER_WIDTH / RENDER_HEIGHT, 0.1, 1000);
    camera.position.set(0, 0, 100);

    // New, improved studio lighting setup
    scene.add(new THREE.HemisphereLight(0xffffff, 0x999999, 1.5));
    const dirLight1 = new THREE.DirectionalLight(0xffffff, 2.0); // Stronger key light
    dirLight1.position.set(1, 1, 1);
    scene.add(dirLight1);
    const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.75); // Softer fill light
    dirLight2.position.set(-1, -1, -0.5);
    scene.add(dirLight2);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(RENDER_WIDTH, RENDER_HEIGHT);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    
    scene.add(objectToFrame);

    try {
        // --- Step 3: Center Object for consistent camera angles ---
        const box = new THREE.Box3().setFromObject(objectToFrame);
        const center = box.getCenter(new THREE.Vector3());
        objectToFrame.position.sub(center);

        // --- Step 4: Frame Camera based on pre-calculated, accurate dimensions ---
        const size = new THREE.Vector3(dimensions.x, dimensions.y, dimensions.z);
        const maxSize = Math.max(size.x, size.y, size.z);
        const fitHeightDistance = maxSize / (2 * Math.atan(Math.PI * camera.fov / 360));
        const fitWidthDistance = fitHeightDistance / camera.aspect;
        const distance = 1.3 * Math.max(fitHeightDistance, fitWidthDistance);
        camera.near = distance / 100;
        camera.far = distance * 100;
        camera.updateProjectionMatrix();

        // --- Step 5: Define Camera Angles & Render ---
        const cameraPositions = [
            { name: 'render_front.png', position: new THREE.Vector3(0, 0, distance) },
            { name: 'render_top.png', position: new THREE.Vector3(0, distance, 0) },
            { name: 'render_angle.png', position: new THREE.Vector3(distance * 0.7, distance * 0.5, distance * 0.7) },
        ];
        const imageFiles: File[] = [];

        for (const view of cameraPositions) {
            camera.position.copy(view.position);
            camera.lookAt(scene.position);
            renderer.render(scene, camera);
            const blob = await new Promise<Blob | null>(res => renderer.domElement.toBlob(res, 'image/png'));
            if (blob) imageFiles.push(new File([blob], view.name, { type: 'image/png' }));
        }

        if (imageFiles.length === 0) {
            throw new Error("Failed to generate any images from the model.");
        }
        
        return { images: imageFiles, dimensions, weight };

    } catch (error) {
        console.error('Error during model rendering:', error);
        throw error; // Re-throw to be caught by the main UI
    } finally {
        // --- Step 6: Cleanup ---
        renderer.dispose();
        materialsToDispose.forEach(m => m.dispose());
        geometriesToDispose.forEach(g => g.dispose());
    }
};