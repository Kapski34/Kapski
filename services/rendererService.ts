
import * as THREE from 'three';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { ThreeMFLoader } from 'three/addons/loaders/3MFLoader.js';

declare const JSZip: any;

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
    
    // PREMIUM MATERIAL: Wygląd wysokiej jakości tworzywa sztucznego
    const premiumMaterial = new THREE.MeshPhysicalMaterial({
        color: 0xeeeeee,
        metalness: 0.05,
        roughness: 0.4,
        reflectivity: 0.5,
        clearcoat: 0.3,
        clearcoatRoughness: 0.25,
        envMapIntensity: 1.0,
    });
    
    const fileBuffer = await modelFile.arrayBuffer();

    if (modelFile.name.toLowerCase().endsWith('.3mf')) {
        const loader = new ThreeMFLoader();
        objectToFrame = loader.parse(fileBuffer);
        objectToFrame.rotation.x = -Math.PI / 2;
        const box = new THREE.Box3().setFromObject(objectToFrame);
        const size = new THREE.Vector3();
        box.getSize(size);
        dimensions = { x: size.x, y: size.y, z: size.z };
        objectToFrame.traverse(child => {
            if (child instanceof THREE.Mesh) child.material = premiumMaterial;
        });
    } else {
        const loader = new STLLoader();
        const geometry = loader.parse(fileBuffer) as THREE.BufferGeometry;
        geometry.rotateX(-Math.PI / 2);
        geometry.computeVertexNormals();
        geometry.computeBoundingBox();
        geometriesToDispose.push(geometry);
        const size = new THREE.Vector3();
        geometry.boundingBox!.getSize(size);
        dimensions = { x: size.x, y: size.y, z: size.z };
        objectToFrame = new THREE.Mesh(geometry, premiumMaterial);
    }
    
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xffffff);

    // ADVANCED LIGHTING SETUP
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6);
    scene.add(hemiLight);

    const mainLight = new THREE.DirectionalLight(0xffffff, 1.4);
    mainLight.position.set(5, 10, 7.5);
    scene.add(mainLight);

    const fillLight = new THREE.DirectionalLight(0xffffff, 0.6);
    fillLight.position.set(-5, 5, 2);
    scene.add(fillLight);

    // RIM LIGHT: Nadaje kontur i głębię
    const rimLight = new THREE.DirectionalLight(0xffffff, 1.0);
    rimLight.position.set(0, 5, -10);
    scene.add(rimLight);

    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(RENDER_WIDTH, RENDER_HEIGHT);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    
    scene.add(objectToFrame);

    const box = new THREE.Box3().setFromObject(objectToFrame);
    const size = new THREE.Vector3();
    box.getSize(size);
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    objectToFrame.position.sub(center);

    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, maxDim * 20);
    const distance = maxDim * 2.5;

    const views = [
        { name: '1_hero_shot.png', pos: [0, size.y * 0.2, distance] },
        { name: '2_isometric.png', pos: [distance * 0.7, distance * 0.5, distance * 0.7] },
        { name: '3_details.png', pos: [-distance * 0.4, size.y * 0.1, distance * 0.4], zoom: 2.2 },
        { name: '4_top_view.png', pos: [0, distance, 0.1] }
    ];

    const imageFiles: File[] = [];
    for (const v of views) {
        camera.position.set(v.pos[0], v.pos[1], v.pos[2]);
        camera.lookAt(0, 0, 0);
        camera.zoom = v.zoom || 1.0;
        camera.updateProjectionMatrix();
        renderer.render(scene, camera);
        const blob = await new Promise<Blob | null>(res => renderer.domElement.toBlob(res, 'image/png'));
        if (blob) imageFiles.push(new File([blob], v.name, { type: 'image/png' }));
    }

    renderer.dispose();
    geometriesToDispose.forEach(g => g.dispose());

    return { images: imageFiles, dimensions, weight: null };
};
