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

        const hasVertexColors = mesh.geometry && mesh.geometry.hasAttribute('color');

        if (!mesh.material) {
            mesh.material = defaultMaterial.clone();
            materialsToDispose.push(mesh.material);
        } else {
            // Robust material conversion to StandardMaterial (PBR)
            const oldMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            
            const newMaterials = oldMaterials.map(oldMat => {
                // Check if we can just reuse color from the old material
                const oldColor = (oldMat as any).color || new THREE.Color(0xffffff);
                const oldMap = (oldMat as any).map || null;
                const oldOpacity = (oldMat as any).opacity ?? 1;
                const oldTransparent = (oldMat as any).transparent ?? false;

                const newMat = new THREE.MeshStandardMaterial({
                    color: oldColor,
                    map: oldMap,
                    vertexColors: hasVertexColors, // Critical for 3MF colors
                    roughness: 0.6, 
                    metalness: 0.1,
                    side: THREE.DoubleSide,
                    transparent: oldTransparent,
                    opacity: oldOpacity
                });

                materialsToDispose.push(newMat);
                return newMat;
            });

            mesh.material = Array.isArray(mesh.material) ? newMaterials : newMaterials[0];
        }

        // Add subtle edges for better shape definition
        if (mesh.geometry) {
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
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8); // Slightly brighter ambient
    scene.add(ambientLight);

    const mainLight = new THREE.DirectionalLight(0xffffff, 1.2);
    mainLight.position.set(5, 12, 8);
    mainLight.castShadow = true;
    mainLight.shadow.mapSize.width = 2048; // Optimized shadow map
    mainLight.shadow.mapSize.height = 2048;
    mainLight.shadow.bias = -0.0001;
    scene.add(mainLight);

    const fillLight = new THREE.DirectionalLight(0xeef2ff, 0.6);
    fillLight.position.set(-8, 2, 5);
    scene.add(fillLight);
    
    const backLight = new THREE.DirectionalLight(0xffffff, 0.6);
    backLight.position.set(0, 8, -10);
    scene.add(backLight);

    // --- POSITIONING ---
    const box = new THREE.Box3().setFromObject(objectToFrame);
    const size = new THREE.Vector3();
    box.getSize(size);
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    
    objectToFrame.position.sub(center);
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
        alpha: true, 
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