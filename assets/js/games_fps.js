import * as THREE from 'three';

import Stats from 'three/addons/libs/stats.module.js';

import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

import { Octree } from 'three/addons/math/Octree.js';
import { OctreeHelper } from 'three/addons/helpers/OctreeHelper.js';

import { Capsule } from 'three/addons/math/Capsule.js';

import { GUI } from 'three/addons/libs/lil-gui.module.min.js';

import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';

const timer = new THREE.Timer();
timer.connect(document);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x88ccee);
scene.fog = new THREE.Fog(0x88ccee, 0, 50);



const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.rotation.order = 'YXZ';

const fillLight1 = new THREE.HemisphereLight(0x8dc1de, 0x00668d, 1.5);
fillLight1.position.set(2, 1, 1);
scene.add(fillLight1);

const directionalLight = new THREE.DirectionalLight(0xffffff, 2.5);
const lightControls = {
    intensidad: 2.5,
    color: 0xffffff,
    sombras: true
};
directionalLight.position.set(- 5, 25, - 1);
directionalLight.castShadow = true;
directionalLight.shadow.camera.near = 0.01;
directionalLight.shadow.camera.far = 500;
directionalLight.shadow.camera.right = 30;
directionalLight.shadow.camera.left = - 30;
directionalLight.shadow.camera.top = 30;
directionalLight.shadow.camera.bottom = - 30;
directionalLight.shadow.mapSize.width = 1024;
directionalLight.shadow.mapSize.height = 1024;
directionalLight.shadow.radius = 4;
directionalLight.shadow.bias = - 0.00006;
scene.add(directionalLight);

const container = document.getElementById('container');

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setAnimationLoop(animate);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.VSMShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
container.appendChild(renderer.domElement);

const stats = new Stats();
const gui = new GUI();
// 🎛️ CONTROL DE LUZ
gui.add(lightControls, 'intensidad', 0, 5).onChange(value => {
    directionalLight.intensity = value;
});

gui.addColor(lightControls, 'color').onChange(value => {
    directionalLight.color.set(value);
});

// 🌫️ CONTROL DE NIEBLA
gui.add(scene.fog, 'near', 0, 50).name('Fog Near');
gui.add(scene.fog, 'far', 10, 200).name('Fog Far');

gui.add(lightControls, 'sombras').onChange(value => {
    directionalLight.castShadow = value;
});

stats.domElement.style.position = 'absolute';
stats.domElement.style.top = '0px';
container.appendChild(stats.domElement);

const GRAVITY = 30;

const NUM_SPHERES = 100;
const SPHERE_RADIUS = 0.2;

const STEPS_PER_FRAME = 5;

const sphereGeometry = new THREE.IcosahedronGeometry(SPHERE_RADIUS, 5);
const sphereMaterial = new THREE.MeshLambertMaterial({ color: 0xdede8d });

const spheres = [];
let sphereIdx = 0;

for (let i = 0; i < NUM_SPHERES; i++) {

    const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
    sphere.castShadow = true;
    sphere.receiveShadow = true;

    scene.add(sphere);

    spheres.push({
        mesh: sphere,
        collider: new THREE.Sphere(new THREE.Vector3(0, - 100, 0), SPHERE_RADIUS),
        velocity: new THREE.Vector3()
    });

}

const worldOctree = new Octree();

const playerCollider = new Capsule(new THREE.Vector3(0, 0.35, 0), new THREE.Vector3(0, 1, 0), 0.35);

const playerVelocity = new THREE.Vector3();
const playerDirection = new THREE.Vector3();

let playerOnFloor = false;
let mouseTime = 0;

const keyStates = {};
let cameraYaw = 0;
let cameraPitch = 0;

// 🎭 PERSONAJE MIXAMO
let character;
let mixer;
const actions = {};
let activeAction;

const vector1 = new THREE.Vector3();
const vector2 = new THREE.Vector3();
const vector3 = new THREE.Vector3();

function setAction(name) {
    if (!actions[name] || activeAction === actions[name]) return;

    if (activeAction) activeAction.fadeOut(0.2);

    activeAction = actions[name];
    activeAction.reset().fadeIn(0.2).play();
}

document.addEventListener('keydown', (event) => {

    keyStates[event.code] = true;

});

document.addEventListener('keyup', (event) => {

    keyStates[event.code] = false;

});

container.addEventListener('mousedown', () => {

    document.body.requestPointerLock();

    mouseTime = performance.now();

});

document.addEventListener('mouseup', () => {

    if (document.pointerLockElement !== null) throwBall();

});

document.body.addEventListener('mousemove', (event) => {

    if (document.pointerLockElement === document.body) {

        cameraYaw -= event.movementX * 0.002;
        cameraPitch -= event.movementY * 0.002;

        // 🔒 límite vertical (MUY IMPORTANTE)
        cameraPitch = Math.max(-Math.PI / 4, Math.min(Math.PI / 4, cameraPitch));

    }

});

window.addEventListener('resize', onWindowResize);

function onWindowResize() {

    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();

    renderer.setSize(window.innerWidth, window.innerHeight);

}

function throwBall() {

    const sphere = spheres[sphereIdx];

    camera.getWorldDirection(playerDirection);

    sphere.collider.center.copy(playerCollider.end).addScaledVector(playerDirection, playerCollider.radius * 1.5);

    // throw the ball with more force if we hold the button longer, and if we move forward

    const impulse = 15 + 30 * (1 - Math.exp((mouseTime - performance.now()) * 0.001));

    sphere.velocity.copy(playerDirection).multiplyScalar(impulse);
    sphere.velocity.addScaledVector(playerVelocity, 2);

    sphereIdx = (sphereIdx + 1) % spheres.length;

}

function playerCollisions() {

    const result = worldOctree.capsuleIntersect(playerCollider);

    playerOnFloor = false;

    if (result) {

        playerOnFloor = result.normal.y > 0;

        if (!playerOnFloor) {

            playerVelocity.addScaledVector(result.normal, - result.normal.dot(playerVelocity));

        }

        if (result.depth >= 1e-10) {

            playerCollider.translate(result.normal.multiplyScalar(result.depth));

        }

    }

}

function updatePlayer(deltaTime) {

    let damping = Math.exp(- 4 * deltaTime) - 1;

    if (!playerOnFloor) {

        playerVelocity.y -= GRAVITY * deltaTime;

        // small air resistance
        damping *= 0.1;

    }

    playerVelocity.addScaledVector(playerVelocity, damping);

    const deltaPosition = playerVelocity.clone().multiplyScalar(deltaTime);
    playerCollider.translate(deltaPosition);

    playerCollisions();

    //camera.position.copy(playerCollider.end);
const playerPos = playerCollider.end.clone();

// 👤 mover personaje
if (character) {
    character.position.copy(playerPos);
    character.position.y -= 1;
}

// 🎥 CÁMARA CONTROLADA POR MOUSE

// distancia de cámara
const offset = new THREE.Vector3(0, 2, 5);

// aplicar rotación (yaw + pitch)
const rotation = new THREE.Euler(cameraPitch, cameraYaw, 0, 'YXZ');
offset.applyEuler(rotation);

// posición final
const desiredPosition = playerPos.clone().add(offset);

// suavizado
camera.position.lerp(desiredPosition, 0.1);

// siempre mirar al jugador
camera.lookAt(playerPos);

// 🔄 rotación del personaje
if (character && playerVelocity.length() > 0.1) {
    const angle = Math.atan2(playerVelocity.x, playerVelocity.z);
    character.rotation.y = angle;
}

}

function playerSphereCollision(sphere) {

    const center = vector1.addVectors(playerCollider.start, playerCollider.end).multiplyScalar(0.5);

    const sphere_center = sphere.collider.center;

    const r = playerCollider.radius + sphere.collider.radius;
    const r2 = r * r;

    // approximation: player = 3 spheres

    for (const point of [playerCollider.start, playerCollider.end, center]) {

        const d2 = point.distanceToSquared(sphere_center);

        if (d2 < r2) {

            const normal = vector1.subVectors(point, sphere_center).normalize();
            const v1 = vector2.copy(normal).multiplyScalar(normal.dot(playerVelocity));
            const v2 = vector3.copy(normal).multiplyScalar(normal.dot(sphere.velocity));

            playerVelocity.add(v2).sub(v1);
            sphere.velocity.add(v1).sub(v2);

            const d = (r - Math.sqrt(d2)) / 2;
            sphere_center.addScaledVector(normal, - d);

        }

    }

}

function spheresCollisions() {

    for (let i = 0, length = spheres.length; i < length; i++) {

        const s1 = spheres[i];

        for (let j = i + 1; j < length; j++) {

            const s2 = spheres[j];

            const d2 = s1.collider.center.distanceToSquared(s2.collider.center);
            const r = s1.collider.radius + s2.collider.radius;
            const r2 = r * r;

            if (d2 < r2) {

                const normal = vector1.subVectors(s1.collider.center, s2.collider.center).normalize();
                const v1 = vector2.copy(normal).multiplyScalar(normal.dot(s1.velocity));
                const v2 = vector3.copy(normal).multiplyScalar(normal.dot(s2.velocity));

                s1.velocity.add(v2).sub(v1);
                s2.velocity.add(v1).sub(v2);

                const d = (r - Math.sqrt(d2)) / 2;

                s1.collider.center.addScaledVector(normal, d);
                s2.collider.center.addScaledVector(normal, - d);

            }

        }

    }

}

function updateSpheres(deltaTime) {

    spheres.forEach(sphere => {

        sphere.collider.center.addScaledVector(sphere.velocity, deltaTime);

        const result = worldOctree.sphereIntersect(sphere.collider);

        if (result) {

            sphere.velocity.addScaledVector(result.normal, - result.normal.dot(sphere.velocity) * 1.5);
            sphere.collider.center.add(result.normal.multiplyScalar(result.depth));

        } else {

            sphere.velocity.y -= GRAVITY * deltaTime;

        }

        const damping = Math.exp(- 1.5 * deltaTime) - 1;
        sphere.velocity.addScaledVector(sphere.velocity, damping);

        playerSphereCollision(sphere);

    });

    spheresCollisions();

    for (const sphere of spheres) {

        sphere.mesh.position.copy(sphere.collider.center);

    }

}

function getForwardVector() {

    camera.getWorldDirection(playerDirection);
    playerDirection.y = 0;
    playerDirection.normalize();

    return playerDirection;

}

function getSideVector() {

    camera.getWorldDirection(playerDirection);
    playerDirection.y = 0;
    playerDirection.normalize();
    playerDirection.cross(camera.up);

    return playerDirection;

}

function controls(deltaTime) {

    const speedDelta = deltaTime * (playerOnFloor ? 25 : 8);

    let moving = false;

    if (keyStates['KeyW']) {
        playerVelocity.add(getForwardVector().multiplyScalar(speedDelta));
        setAction('Running');
        moving = true;
    }

    if (keyStates['KeyS']) {
        playerVelocity.add(getForwardVector().multiplyScalar(-speedDelta));
        setAction('Running');
        moving = true;
    }

    if (keyStates['KeyA']) {
        playerVelocity.add(getSideVector().multiplyScalar(-speedDelta));
        setAction('Left Strafe');
        moving = true;
    }

    if (keyStates['KeyD']) {
        playerVelocity.add(getSideVector().multiplyScalar(speedDelta));
        setAction('Left Strafe');
        moving = true;
    }

    if (!moving && playerOnFloor) {
        setAction('Standing Idle');
    }

    if (playerOnFloor && keyStates['Space']) {
        playerVelocity.y = 15;
        setAction('Jump');
    }

    if (keyStates['KeyF']) {
        setAction('Punching');
    }
    // 🎮 control de cámara con teclado
if (keyStates['ArrowLeft']) cameraYaw += 0.03;
if (keyStates['ArrowRight']) cameraYaw -= 0.03;
}

const loader = new GLTFLoader().setPath('./models/gltf/');

const fbxLoader = new FBXLoader();

const assets = [
   'Standing Idle',
    'Running',
    'Jump',
    'Punching',
    'Left Strafe',
    'character'
];

const loaded = {};

assets.forEach(name => {

    fbxLoader.load(`./models/fbx/${name}.fbx`, (fbx) => {

        console.log(name + " cargado");

        if (name === 'character') {

            character = fbx;

            character.scale.setScalar(0.01);

            scene.add(character);

            mixer = new THREE.AnimationMixer(character);

        } else {

           // loaded[name] = fbx.animations[0];
           const clip = fbx.animations[0];
clip.name = name; // 🔥 CLAVE

loaded[name] = clip;

        }

        if (Object.keys(loaded).length === assets.length - 1 && character) {

            for (const name in loaded) {
                actions[name] = mixer.clipAction(loaded[name]);
            }

            activeAction = actions['Standing Idle'];
            activeAction.play();

        }

    });

});

loader.load('scene.gltf', (gltf) => {

    console.log("MODELO CARGADO ✅");

    const modelo = gltf.scene;

    // 🔍 MEDIR
    const box = new THREE.Box3().setFromObject(modelo);
    const size = box.getSize(new THREE.Vector3());

    console.log("Tamaño del modelo:", size);

    // 🎯 escalar correctamente
let escala = 2 / size.y;
escala *= 1.5;

modelo.scale.setScalar(escala);

    // 🎯 ESCALA REAL AUTOMÁTICA
    //const escala = 2 / size.y;  
    //modelo.scale.setScalar(escala);

    // 📍 POSICIÓN
    modelo.position.set(0, 0, 0);

    scene.add(modelo);

    // 🔥 COLISIONES
    worldOctree.clear();
    worldOctree.fromGraphNode(modelo);

    // 👤 JUGADOR (altura realista)
    playerCollider.start.set(0, 1, 0);
    playerCollider.end.set(0, 2, 0);

    modelo.traverse(child => {
        if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;

             // 🔥 MUY IMPORTANTE PARA COLISIONES
        child.geometry.computeBoundsTree?.();
        child.geometry.computeVertexNormals();

            if (child.material.map) {
                child.material.map.anisotropy = 4;
            }
        }
    });

}, undefined, (error) => {
    console.error("ERROR AL CARGAR ❌", error);
});





function teleportPlayerIfOob() {

    if (camera.position.y <= - 25) {

        playerCollider.start.set(0, 0.35, 0);
        playerCollider.end.set(0, 1, 0);
        playerCollider.radius = 0.35;
        camera.position.copy(playerCollider.end);
        camera.rotation.set(0, 0, 0);

    }

}


function animate() {

    timer.update();

    const deltaTime = Math.min(0.05, timer.getDelta()) / STEPS_PER_FRAME;

    // we look for collisions in substeps to mitigate the risk of
    // an object traversing another too quickly for detection.

 for (let i = 0; i < STEPS_PER_FRAME; i++) {

    controls(deltaTime);
    updatePlayer(deltaTime);
    updateSpheres(deltaTime);
    teleportPlayerIfOob();

    if (mixer) mixer.update(deltaTime); // 🔥 AQUÍ VA
}

    renderer.render(scene, camera);

    stats.update();

}

