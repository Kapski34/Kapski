
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
    
    // MATERIAL: STUDIO CLAY (WHITE MATTE)
    // This looks like a plaster cast. It creates excellent contrast for geometry
    // without looking dark or metallic.
    const baseMaterial = new THREE.MeshStandardMaterial({
        color: 0xEFEFEF,     // Almost white
        roughness: 0.8,      // Matte finish (clay/plaster)
        metalness: 0.0,      // Non-metallic
        flatShading: false,
    });
    
    // Subtle edge lines to help with definition, but not overpowering
    const lineMaterial = new THREE.LineBasicMaterial({ color: 0x333333, linewidth: 1, transparent: true, opacity: 0.2 });

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
        objectToFrame.traverse(child => {
            if (child instanceof THREE.Mesh) {
                child.material = baseMaterial;
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
    // Instead of static lights, we attach lights TO THE CAMERA.
    // This ensures the object is always perfectly lit from the viewer's perspective.
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 10000);
    scene.add(camera);

    // 1. Key Light (Top-Right relative to camera)
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
    keyLight.position.set(10, 10, 10);
    keyLight.castShadow = true;
    keyLight.shadow.bias = -0.0001;
    keyLight.shadow.mapSize.width = 2048; // Sharp shadows
    keyLight.shadow.mapSize.height = 2048;
    camera.add(keyLight); // Move with camera

    // 2. Fill Light (Left relative to camera, softer)
    const fillLight = new THREE.DirectionalLight(0xeef2ff, 0.6);
    fillLight.position.set(-10, 0, 10);
    fillLight.castShadow = false;
    camera.add(fillLight);

    // 3. Rim/Back Light (Behind, helps separate edges)
    const rimLight = new THREE.DirectionalLight(0xffffff, 0.4);
    rimLight.position.set(0, 10, -10);
    camera.add(rimLight);

    // Ambient light for base visibility
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
    const size = new THREE.Vector3();
    box.getSize(size);
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    
    objectToFrame.position.sub(center); 

    // Move camera back enough to fit object
    const distance = maxDim * 2.2;

    // PLANETARY SCANNER (26 ANGLES)
    // We keep the planetary logic because it guarantees we find the front,
    // but now every single angle will be beautifully lit "Studio Style".
    const views: { name: string; pos: THREE.Vector3; up: THREE.Vector3 }[] = [];

    const addView = (name: string, x: number, y: number, z: number, upX: number, upY: number, upZ: number) => {
        views.push({
            name,
            pos: new THREE.Vector3(x, y, z).normalize().multiplyScalar(distance),
            up: new THREE.Vector3(upX, upY, upZ)
        });
    };

    // 1. EQUATORIAL RING (Standard Y-up rotation)
    for (let i = 0; i < 8; i++) {
        const angle = (i * 45) * (Math.PI / 180);
        addView(`ring_y_${i * 45}.png`, Math.sin(angle), 0, Math.cos(angle), 0, 1, 0);
    }

    // 2. POLAR RING (Orbiting over the top/bottom - X axis)
    for (let i = 0; i < 8; i++) {
        if (i === 0 || i === 4) continue; 
        const angle = (i * 45) * (Math.PI / 180);
        addView(`ring_x_${i * 45}.png`, 0, Math.sin(angle), Math.cos(angle), 0, Math.cos(angle + Math.PI/2), -Math.sin(angle + Math.PI/2));
    }

    // 3. ISOMETRIC CORNERS (Best for "Style" shots)
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

        // NOTE: Lights move automatically because they are children of 'camera'
        
        renderer.render(scene, camera);
        const blob = await new Promise<Blob | null>(res => renderer.domElement.toBlob(res, 'image/png'));
        if (blob) imageFiles.push(new File([blob], v.name, { type: 'image/png' }));
    }

    renderer.dispose();
    geometriesToDispose.forEach(g => g.dispose());

    return { images: imageFiles, dimensions, weight: null };
};
