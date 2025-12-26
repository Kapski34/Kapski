import * as THREE from 'three';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { ThreeMFLoader } from 'three/addons/loaders/3MFLoader.js';

// High resolution for crisp details
const RENDER_WIDTH = 2048; 
const RENDER_HEIGHT = 2048;

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
    const materialsToDispose: THREE.Material[] = [];
    
    // Default Material (Fallback) - Light Grey Satin
    const defaultMaterial = new THREE.MeshStandardMaterial({
        color: 0xE0E0E0,
        roughness: 0.5,
        metalness: 0.1,
        side: THREE.DoubleSide
    });
    materialsToDispose.push(defaultMaterial);
    
    // Edge/Line Material for technical look
    const lineMaterial = new THREE.LineBasicMaterial({ 
        color: 0x222222, 
        linewidth: 1, 
        transparent: true, 
        opacity: 0.15 
    });
    materialsToDispose.push(lineMaterial);

    const fileBuffer = await modelFile.arrayBuffer();

    const processMesh = (mesh: THREE.Mesh) => {
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        // Ensure geometry normals exist for proper lighting
        if (mesh.geometry && !mesh.geometry.attributes.normal) {
            mesh.geometry.computeVertexNormals();
        }

        // --- CRITICAL COLOR FIX ---
        // Check if the geometry has vertex colors (common in 3MF/Color 3D prints)
        const hasVertexColors = mesh.geometry && mesh.geometry.hasAttribute('color');

        if (!mesh.material) {
            // No material? Use default.
            mesh.material = defaultMaterial.clone();
            materialsToDispose.push(mesh.material);
        } else {
            // FIX: Handle Multi-Material Meshes correctly.
            // Previously, we only took material[0], which turned multi-colored objects into single-colored ones.
            const oldMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            
            const newMaterials = oldMaterials.map(oldMat => {
                const newMat = new THREE.MeshStandardMaterial({
                    // Preserve Color
                    color: (oldMat as any).color || 0xffffff,
                    // Preserve Texture Map
                    map: (oldMat as any).map || null,
                    // FORCE Vertex Colors if geometry has them
                    vertexColors: hasVertexColors,
                    // Make it look like high-quality 3D print plastic
                    roughness: 0.6, 
                    metalness: 0.1,
                    side: THREE.DoubleSide,
                });

                // If the old material had specific settings, try to respect them slightly
                if ((oldMat as any).transparent) newMat.transparent = true;
                if ((oldMat as any).opacity) newMat.opacity = (oldMat as any).opacity;
                
                materialsToDispose.push(newMat);
                return newMat;
            });

            // Assign back as array if it was array, or single if it was single
            mesh.material = Array.isArray(mesh.material) ? newMaterials : newMaterials[0];
        }

        // Add subtle edges for better shape definition
        if (mesh.geometry) {
             // Angle threshold 25 to only show sharp edges
            const edges = new THREE.EdgesGeometry(mesh.geometry, 25); 
            const line = new THREE.LineSegments(edges, lineMaterial);
            mesh.add(line);
            geometriesToDispose.push(edges);
        }
    };

    // --- LOADER LOGIC ---
    if (modelFile.name.toLowerCase().endsWith('.3mf')) {
        const loader = new ThreeMFLoader();
        objectToFrame = loader.parse(fileBuffer);
        
        // Calculate size immediately
        const box = new THREE.Box3().setFromObject(objectToFrame);
        const size = new THREE.Vector3();
        box.getSize(size);
        dimensions = { x: size.x, y: size.y, z: size.z };
        
        objectToFrame.traverse(child => {
            if (child instanceof THREE.Mesh) {
                processMesh(child);
            }
        });
    } else {
        const loader = new STLLoader();
        const geometry = loader.parse(fileBuffer) as THREE.BufferGeometry;
        
        if (!geometry.attributes.normal) geometry.computeVertexNormals();
        geometry.center(); 
        geometry.computeBoundingBox();
        geometriesToDispose.push(geometry);
        
        const size = new THREE.Vector3();
        geometry.boundingBox!.getSize(size);
        dimensions = { x: size.x, y: size.y, z: size.z };
        
        const mesh = new THREE.Mesh(geometry, defaultMaterial.clone());
        processMesh(mesh);
        objectToFrame = mesh;
    }
    
    // --- SCENE SETUP ---
    const scene = new THREE.Scene();
    
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 10000); 
    scene.add(camera);

    // --- LIGHTING (Studio Setup) ---
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);

    // Key Light (Main Shadow Caster)
    const mainLight = new THREE.DirectionalLight(0xffffff, 1.2);
    mainLight.position.set(5, 12, 8);
    mainLight.castShadow = true;
    mainLight.shadow.mapSize.width = 4096;
    mainLight.shadow.mapSize.height = 4096;
    mainLight.shadow.bias = -0.0001;
    mainLight.shadow.radius = 2; // Softer shadows
    scene.add(mainLight);

    // Fill Light
    const fillLight = new THREE.DirectionalLight(0xeef2ff, 0.6);
    fillLight.position.set(-8, 2, 5);
    scene.add(fillLight);
    
    // Rim Light (Back)
    const backLight = new THREE.DirectionalLight(0xffffff, 0.6);
    backLight.position.set(0, 8, -10);
    scene.add(backLight);

    // --- POSITIONING ---
    const box = new THREE.Box3().setFromObject(objectToFrame);
    const size = new THREE.Vector3();
    box.getSize(size);
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    
    // Reset position to origin
    objectToFrame.position.sub(center);
    // Lift so it sits perfectly ON the ground (y=0)
    objectToFrame.position.y += size.y / 2;
    
    scene.add(objectToFrame);

    // --- SHADOW CATCHER ---
    const planeGeometry = new THREE.PlaneGeometry(2000, 2000);
    planeGeometry.rotateX(-Math.PI / 2);
    
    const planeMaterial = new THREE.ShadowMaterial({
        opacity: 0.15,
        color: 0x000000
    });
    
    const shadowPlane = new THREE.Mesh(planeGeometry, planeMaterial);
    shadowPlane.position.y = 0; 
    shadowPlane.receiveShadow = true;
    scene.add(shadowPlane);
    
    geometriesToDispose.push(planeGeometry);
    materialsToDispose.push(planeMaterial);

    // --- RENDERER ---
    const renderer = new THREE.WebGLRenderer({ 
        antialias: true, 
        preserveDrawingBuffer: true, 
        alpha: true, // TRANSPARENT BACKGROUND
        powerPreference: "high-performance"
    });
    
    renderer.setSize(RENDER_WIDTH, RENDER_HEIGHT);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); 
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // --- CAPTURING VIEWS ---
    const distance = maxDim * 3.5;
    const lookAtTarget = new THREE.Vector3(0, size.y / 2, 0);

    const views: { name: string; pos: THREE.Vector3; up: THREE.Vector3 }[] = [];

    const addView = (name: string, x: number, y: number, z: number, upX: number, upY: number, upZ: number) => {
        views.push({
            name,
            pos: new THREE.Vector3(x, y, z).normalize().multiplyScalar(distance),
            up: new THREE.Vector3(upX, upY, upZ)
        });
    };

    for (let i = 0; i < 8; i++) {
        const angle = (i * 45) * (Math.PI / 180);
        addView(`view_${i * 45}.png`, Math.sin(angle), 0.5, Math.cos(angle), 0, 1, 0); 
    }
    
    addView('top.png', 0, 1, 0, 0, 0, -1);
    addView('iso_1.png', 1, 0.8, 1, 0, 1, 0);
    addView('iso_2.png', -1, 0.8, 1, 0, 1, 0);

    const imageFiles: File[] = [];

    for (const v of views) {
        camera.position.copy(v.pos);
        camera.position.y += size.y * 0.4; 
        camera.up.copy(v.up);
        camera.lookAt(lookAtTarget);
        camera.updateProjectionMatrix();
        
        renderer.render(scene, camera);
        const blob = await new Promise<Blob | null>(res => renderer.domElement.toBlob(res, 'image/png', 1.0));
        if (blob) imageFiles.push(new File([blob], v.name, { type: 'image/png' }));
    }

    // --- CLEANUP ---
    renderer.dispose();
    geometriesToDispose.forEach(g => g.dispose());
    materialsToDispose.forEach(m => m.dispose());

    return { images: imageFiles, dimensions, weight: null };
};