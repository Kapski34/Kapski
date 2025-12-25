
import * as THREE from 'three';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { ThreeMFLoader } from 'three/addons/loaders/3MFLoader.js';

// Increased resolution for better detail detection
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
    weight: number | null;
}

export const generateImagesFromModel = async (modelFile: File): Promise<RenderResult> => {
    let dimensions: ModelDimensions;
    let objectToFrame: THREE.Object3D;
    const geometriesToDispose: THREE.BufferGeometry[] = [];
    
    // MATERIAL: NEUTRAL GREY PLASTIC - Optimized for AI-to-Image input
    const baseMaterial = new THREE.MeshStandardMaterial({
        color: 0xDDDDDD,     // Standard Grey
        roughness: 0.5,      // Semi-gloss/Plastic look (easier for AI to texture than dry clay)
        metalness: 0.1,      // Slight reflectivity
        flatShading: false,
    });
    
    // Very subtle lines, just enough for definition but not to look like a sketch
    const lineMaterial = new THREE.LineBasicMaterial({ color: 0x222222, linewidth: 1, transparent: true, opacity: 0.15 });

    const fileBuffer = await modelFile.arrayBuffer();

    const addEdgesToMesh = (mesh: THREE.Mesh) => {
        if (mesh.geometry) {
            const edges = new THREE.EdgesGeometry(mesh.geometry, 25); 
            const line = new THREE.LineSegments(edges, lineMaterial);
            mesh.add(line);
            geometriesToDispose.push(edges);
        }
    };

    if (modelFile.name.toLowerCase().endsWith('.3mf')) {
        const loader = new ThreeMFLoader();
        objectToFrame = loader.parse(fileBuffer);
        const box = new THREE.Box3().setFromObject(objectToFrame);
        const size = new THREE.Vector3();
        box.getSize(size);
        dimensions = { x: size.x, y: size.y, z: size.z };
        
        // 3MF PRESERVATION LOGIC
        objectToFrame.traverse(child => {
            if (child instanceof THREE.Mesh) {
                // If the 3MF loaded a material, we KEEP it to preserve color.
                // We only adjust properties to make it look good in our lighting.
                if (child.material) {
                    // Handle array of materials or single material
                    const materials = Array.isArray(child.material) ? child.material : [child.material];
                    
                    materials.forEach(mat => {
                        // Ensure it reacts to light properly
                        mat.needsUpdate = true;
                        
                        // If it's a Standard or Phong material, we can tune it for plastic look
                        if ('roughness' in mat) {
                             // If roughness is default (1), make it smoother like plastic (0.5)
                             if (mat.roughness === 1) mat.roughness = 0.5;
                        }
                        if ('metalness' in mat) {
                             mat.metalness = 0.1;
                        }
                        mat.flatShading = false;
                    });
                } else {
                    // Fallback only if no material exists
                    child.material = baseMaterial;
                }

                child.castShadow = true;
                child.receiveShadow = true;
                addEdgesToMesh(child);
            }
        });
    } else {
        const loader = new STLLoader();
        const geometry = loader.parse(fileBuffer) as THREE.BufferGeometry;
        
        geometry.computeVertexNormals();
        geometry.center(); 
        geometry.computeBoundingBox();
        geometriesToDispose.push(geometry);
        const size = new THREE.Vector3();
        geometry.boundingBox!.getSize(size);
        dimensions = { x: size.x, y: size.y, z: size.z };
        
        const mesh = new THREE.Mesh(geometry, baseMaterial);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        addEdgesToMesh(mesh);
        objectToFrame = mesh;
    }
    
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xffffff); // White background

    // CAMERA RIG SETUP
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 10000);
    scene.add(camera);

    // 1. Key Light
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
    keyLight.position.set(10, 10, 10);
    keyLight.castShadow = true;
    keyLight.shadow.bias = -0.0001;
    keyLight.shadow.mapSize.width = 2048;
    keyLight.shadow.mapSize.height = 2048;
    camera.add(keyLight);

    // 2. Fill Light
    const fillLight = new THREE.DirectionalLight(0xeef2ff, 0.6);
    fillLight.position.set(-10, 0, 10);
    fillLight.castShadow = false;
    camera.add(fillLight);

    // 3. Rim/Back Light
    const rimLight = new THREE.DirectionalLight(0xffffff, 0.4);
    rimLight.position.set(0, 10, -10);
    camera.add(rimLight);

    // Ambient light
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);

    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: true });
    renderer.setSize(RENDER_WIDTH, RENDER_HEIGHT);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    
    scene.add(objectToFrame);

    // CENTER & SCALE
    const box = new THREE.Box3().setFromObject(objectToFrame);
    const sizeVec = new THREE.Vector3();
    box.getSize(sizeVec);
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(sizeVec.x, sizeVec.y, sizeVec.z);
    
    objectToFrame.position.sub(center); 

    // Move camera back enough to fit object
    const distance = maxDim * 2.2;

    const views: { name: string; pos: THREE.Vector3; up: THREE.Vector3 }[] = [];

    const addView = (name: string, x: number, y: number, z: number, upX: number, upY: number, upZ: number) => {
        views.push({
            name,
            pos: new THREE.Vector3(x, y, z).normalize().multiplyScalar(distance),
            up: new THREE.Vector3(upX, upY, upZ)
        });
    };

    // 1. EQUATORIAL RING
    for (let i = 0; i < 8; i++) {
        const angle = (i * 45) * (Math.PI / 180);
        addView(`ring_y_${i * 45}.png`, Math.sin(angle), 0, Math.cos(angle), 0, 1, 0);
    }

    // 2. POLAR RING
    for (let i = 0; i < 8; i++) {
        if (i === 0 || i === 4) continue; 
        const angle = (i * 45) * (Math.PI / 180);
        addView(`ring_x_${i * 45}.png`, 0, Math.sin(angle), Math.cos(angle), 0, Math.cos(angle + Math.PI/2), -Math.sin(angle + Math.PI/2));
    }

    // 3. ISOMETRIC CORNERS
    const isoDist = 1;
    addView('iso_top_fr.png', isoDist, isoDist, isoDist, 0, 1, 0);
    addView('iso_top_fl.png', -isoDist, isoDist, isoDist, 0, 1, 0);
    addView('iso_top_br.png', isoDist, isoDist, -isoDist, 0, 1, 0);
    addView('iso_top_bl.png', -isoDist, isoDist, -isoDist, 0, 1, 0);
    
    addView('iso_bot_fr.png', isoDist, -isoDist, isoDist, 0, 1, 0);
    addView('iso_bot_fl.png', -isoDist, -isoDist, isoDist, 0, 1, 0);
    addView('iso_bot_br.png', isoDist, -isoDist, -isoDist, 0, 1, 0);
    addView('iso_bot_bl.png', -isoDist, -isoDist, -isoDist, 0, 1, 0);

    // 4. DIRECT TOP/BOTTOM
    addView('top_direct.png', 0, 1, 0, 0, 0, -1);
    addView('bottom_direct.png', 0, -1, 0, 0, 0, 1);

    const imageFiles: File[] = [];

    for (const v of views) {
        camera.position.copy(v.pos);
        camera.up.copy(v.up);
        camera.lookAt(0, 0, 0);
        camera.updateProjectionMatrix();
        
        renderer.render(scene, camera);
        const blob = await new Promise<Blob | null>(res => renderer.domElement.toBlob(res, 'image/png'));
        if (blob) imageFiles.push(new File([blob], v.name, { type: 'image/png' }));
    }

    renderer.dispose();
    geometriesToDispose.forEach(g => g.dispose());

    return { images: imageFiles, dimensions, weight: null };
};
