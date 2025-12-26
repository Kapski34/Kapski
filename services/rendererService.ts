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
    
    // Default Material (Fallback for uncolored STLs) - Light Grey Satin
    const defaultMaterial = new THREE.MeshStandardMaterial({
        color: 0xE0E0E0,
        roughness: 0.5,
        metalness: 0.1,
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

        // CRITICAL: Handle Materials correctly
        if (!mesh.material) {
            // No material? Use default.
            mesh.material = defaultMaterial;
        } else {
            // Has material? Upgrade it to Standard if it's Basic, preserving color.
            if (mesh.material instanceof THREE.MeshBasicMaterial) {
                const oldMat = mesh.material;
                const newMat = new THREE.MeshStandardMaterial({
                    color: oldMat.color,
                    map: oldMat.map,
                    vertexColors: (oldMat as any).vertexColors,
                    roughness: 0.5,
                    metalness: 0.1,
                    side: THREE.DoubleSide
                });
                mesh.material = newMat;
                materialsToDispose.push(newMat);
            } else if (mesh.material instanceof THREE.MeshStandardMaterial || mesh.material instanceof THREE.MeshPhongMaterial) {
                // Keep existing advanced materials but ensure sides
                mesh.material.side = THREE.DoubleSide;
                mesh.material.shadowSide = THREE.DoubleSide;
            }
        }
        
        // Handle Multi-materials
        if (Array.isArray(mesh.material)) {
            mesh.material.forEach(m => {
                m.side = THREE.DoubleSide;
                m.shadowSide = THREE.DoubleSide;
            });
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
        
        // Calculate size immediately to normalize
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
        
        const mesh = new THREE.Mesh(geometry, defaultMaterial);
        processMesh(mesh);
        objectToFrame = mesh;
    }
    
    // --- SCENE SETUP ---
    const scene = new THREE.Scene();
    // Intentionally NO background color set -> produces transparent background
    
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 10000); 
    scene.add(camera);

    // --- LIGHTING (Studio Setup) ---
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    // Key Light (Main Shadow Caster)
    const mainLight = new THREE.DirectionalLight(0xffffff, 1.2);
    mainLight.position.set(5, 12, 8);
    mainLight.castShadow = true;
    mainLight.shadow.mapSize.width = 4096; // Ultra sharp shadows
    mainLight.shadow.mapSize.height = 4096;
    mainLight.shadow.bias = -0.0001;
    scene.add(mainLight);

    // Fill Light
    const fillLight = new THREE.DirectionalLight(0xeef2ff, 0.5);
    fillLight.position.set(-8, 2, 5);
    scene.add(fillLight);
    
    // Rim Light (Back)
    const backLight = new THREE.DirectionalLight(0xffffff, 0.5);
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
    // Invisible plane that only receives shadows
    const planeGeometry = new THREE.PlaneGeometry(2000, 2000);
    planeGeometry.rotateX(-Math.PI / 2);
    
    const planeMaterial = new THREE.ShadowMaterial({
        opacity: 0.15, // Subtle shadow
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
    // Super-sampling for smoothness (Limit to 2 to avoid crash)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); 
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // --- CAPTURING VIEWS ---
    const distance = maxDim * 3.5; // Zoom out slightly more for better context
    const lookAtTarget = new THREE.Vector3(0, size.y / 2, 0); // Look at center of object

    const views: { name: string; pos: THREE.Vector3; up: THREE.Vector3 }[] = [];

    const addView = (name: string, x: number, y: number, z: number, upX: number, upY: number, upZ: number) => {
        views.push({
            name,
            pos: new THREE.Vector3(x, y, z).normalize().multiplyScalar(distance),
            up: new THREE.Vector3(upX, upY, upZ)
        });
    };

    // 1. Orbit around
    for (let i = 0; i < 8; i++) {
        const angle = (i * 45) * (Math.PI / 180);
        addView(`view_${i * 45}.png`, Math.sin(angle), 0.5, Math.cos(angle), 0, 1, 0); 
    }
    
    // 2. Top-down
    addView('top.png', 0, 1, 0, 0, 0, -1);
    
    // 3. Isometric-like corners
    addView('iso_1.png', 1, 0.8, 1, 0, 1, 0);
    addView('iso_2.png', -1, 0.8, 1, 0, 1, 0);

    const imageFiles: File[] = [];

    for (const v of views) {
        camera.position.copy(v.pos);
        // Offset camera height slightly relative to object center for better framing
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