// --- Game State and Setup ---
let scene, camera, renderer, font;
let sudokuGroup, selectionBox;
let isDragging = false;
let previousMousePosition = { x: 0, y: 0 };
let numberMeshes = [];

const masterGrid = Array(9).fill(0).map(() => Array(9).fill(0).map(() => Array(9).fill(0)));
const initialMasterGrid = Array(9).fill(0).map(() => Array(9).fill(0).map(() => Array(9).fill(0)));

let selectedCoords = { x: null, y: null, z: null };
let currentSlices = { x: 4, y: 4, z: 4 };

async function init() {
    // --- Basic scene setup ---
    const cubeContainer = document.getElementById('cube-container');
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, cubeContainer.clientWidth / cubeContainer.clientHeight, 0.1, 1000);
    camera.position.set(15, 15, 15);
    camera.lookAt(0, 0, 0);
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(cubeContainer.clientWidth, cubeContainer.clientHeight);
    cubeContainer.appendChild(renderer.domElement);
    
    // --- Create and add all static 3D objects FIRST ---
    sudokuGroup = new THREE.Group();
    const geometry = new THREE.BoxGeometry(9, 9, 9);
    const faceMaterials = Array(6).fill().map(() => new THREE.MeshBasicMaterial({ color: 0x2a2a2a }));
    const solidCube = new THREE.Mesh(geometry, faceMaterials);
    solidCube.renderOrder = 0;
    sudokuGroup.add(solidCube);

    const edges = new THREE.EdgesGeometry(geometry);
    const wireframeMaterial = new THREE.LineBasicMaterial({ color: 0x888888 });
    const wireframe = new THREE.LineSegments(edges, wireframeMaterial);
    wireframe.renderOrder = 1;
    sudokuGroup.add(wireframe);

    const selectionGeom = new THREE.BoxGeometry(1, 1, 1);
    const selectionMat = new THREE.MeshBasicMaterial({ color: 0x4a90e2, transparent: true, opacity: 0.5 });
    selectionBox = new THREE.Mesh(selectionGeom, selectionMat);
    selectionBox.visible = false;
    selectionBox.renderOrder = 3;
    sudokuGroup.add(selectionBox);
    
    scene.add(sudokuGroup);
    
    // --- Setup UI and controls ---
    setupControlsPanel();
    setupGUI();
    
    renderer.domElement.addEventListener('mousedown', onMouseDown);
    renderer.domElement.addEventListener('mouseup', onMouseUp);
    renderer.domElement.addEventListener('mousemove', onMouseMove);
    renderer.domElement.addEventListener('wheel', onMouseWheel);
    window.addEventListener('resize', onWindowResize);
    window.addEventListener('keydown', onKeyDown);
    
    // --- Start animation and handle resizing ---
    onWindowResize();
    animate();

    // --- Start the async data loading process LAST ---
    const fontLoader = new THREE.FontLoader();
    fontLoader.load('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/fonts/helvetiker_regular.typeface.json', (loadedFont) => {
        font = loadedFont;
        const initialDifficulty = document.getElementById('difficulty-select').value;
        loadPuzzles(initialDifficulty);
    });
}

function setupGUI() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabPanes = document.querySelectorAll('.tab-pane');
    const newGameBtn = document.getElementById('new-game-btn');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            tabPanes.forEach(pane => {
                if (pane.id === `${btn.dataset.tab}-tab`) {
                    pane.classList.add('active');
                } else {
                    pane.classList.remove('active');
                }
            });
        });
    });

    newGameBtn.addEventListener('click', () => {
        const difficulty = document.getElementById('difficulty-select').value;
        document.getElementById('loader').style.display = 'block'; // Show loader
        loadPuzzles(difficulty);
    });
}

function updateGameStats() {
    let filledCount = 0;
    const totalSurfaceCells = 386;

    for (let x = 0; x < 9; x++) {
        for (let y = 0; y < 9; y++) {
            for (let z = 0; z < 9; z++) {
                if (x > 0 && x < 8 && y > 0 && y < 8 && z > 0 && z < 8) continue;
                if (masterGrid[x][y][z] !== 0) {
                    filledCount++;
                }
            }
        }
    }
    document.getElementById('cells-filled-stat').innerText = `${filledCount} / ${totalSurfaceCells}`;
}

async function loadPuzzles(difficulty = 'medium') {
     try {
        const response = await fetch(`http://127.0.0.1:5000/api/sudoku?difficulty=${difficulty}`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        for (let i = 0; i < 9; i++) {
            for (let j = 0; j < 9; j++) {
                for (let k = 0; k < 9; k++) {
                    masterGrid[i][j][k] = 0;
                    initialMasterGrid[i][j][k] = 0;
                }
            }
        }

        const facePuzzles = await response.json();
        mapFacesTo3DGrid(facePuzzles);
        document.getElementById('loader').style.display = 'none';
        draw3DNumbers();
        updateAllSliceViews();
        updateGameStats();
    } catch (error) {
        console.error("Could not fetch Sudoku puzzles:", error);
        document.getElementById('loader').innerText = 'Error loading puzzles.';
    }
}

function mapFacesTo3DGrid(facePuzzles) {
    const faceMap = {
        4: facePuzzles[4].puzzle, 5: facePuzzles[5].puzzle, 0: facePuzzles[0].puzzle,
        1: facePuzzles[1].puzzle, 2: facePuzzles[2].puzzle, 3: facePuzzles[3].puzzle,
    };
    for (let x = 0; x < 9; x++) { for (let y = 0; y < 9; y++) { for (let z = 0; z < 9; z++) {
        if (x > 0 && x < 8 && y > 0 && y < 8 && z > 0 && z < 8) continue;
        let val = 0;
        if (z === 8) val = faceMap[4][y][x]; if (z === 0) val = faceMap[5][y][8-x];
        if (x === 8) val = faceMap[0][y][8-z]; if (x === 0) val = faceMap[1][y][z];
        if (y === 8) val = faceMap[2][z][x]; if (y === 0) val = faceMap[3][8-z][x];
        if(val) { masterGrid[x][y][z] = val; initialMasterGrid[x][y][z] = val; }
    }}}
}

function draw3DNumbers() {
    numberMeshes.forEach(mesh => sudokuGroup.remove(mesh));
    numberMeshes = [];
    const textMatInitial = new THREE.MeshBasicMaterial({ color: 0xf0f0f0 });
    const textMatUser = new THREE.MeshBasicMaterial({ color: 0x4a90e2 });
    for (let x = 0; x < 9; x++) { for (let y = 0; y < 9; y++) { for (let z = 0; z < 9; z++) {
        const val = masterGrid[x][y][z];
        if (val !== 0) {
            const textGeom = new THREE.TextGeometry(val.toString(), { font: font, size: 0.5, height: 0.05 });
            textGeom.center();
            const isInitial = initialMasterGrid[x][y][z] !== 0;
            const textMat = isInitial ? textMatInitial : textMatUser;
            const centerPosition = new THREE.Vector3(x - 4, y - 4, z - 4);
            const surfacePosition = 4.5, epsilon = 0.02;
            if (x === 0 || x === 8) {
                const mesh = new THREE.Mesh(textGeom, textMat);
                const pos = centerPosition.clone();
                pos.x = Math.sign(pos.x) * (surfacePosition + epsilon);
                mesh.rotation.y = Math.sign(pos.x) * (Math.PI / 2);
                mesh.position.copy(pos); mesh.renderOrder = 2;
                sudokuGroup.add(mesh); numberMeshes.push(mesh);
            }
            if (y === 0 || y === 8) {
                const mesh = new THREE.Mesh(textGeom, textMat);
                const pos = centerPosition.clone();
                pos.y = Math.sign(pos.y) * (surfacePosition + epsilon);
                mesh.rotation.x = Math.sign(pos.y) * -(Math.PI / 2);
                mesh.position.copy(pos); mesh.renderOrder = 2;
                sudokuGroup.add(mesh); numberMeshes.push(mesh);
            }
            if (z === 0 || z === 8) {
                const mesh = new THREE.Mesh(textGeom, textMat);
                const pos = centerPosition.clone();
                pos.z = Math.sign(pos.z) * (surfacePosition + epsilon);
                mesh.position.copy(pos); mesh.renderOrder = 2;
                sudokuGroup.add(mesh); numberMeshes.push(mesh);
            }
        }
    }}}
}

function setupControlsPanel() {
    const panel = document.getElementById('slices-tab');
    panel.innerHTML = '';
    ['x', 'y', 'z'].forEach(axis => {
        const view = document.createElement('div');
        view.className = 'slice-view';
        view.innerHTML = `
            <div class="slice-header">
                <span>${axis.toUpperCase()} Slice</span>
                <div class="slice-controls">
                    <button data-axis="${axis}" data-dir="-1">-</button>
                    <span id="${axis}-slice-index">${currentSlices[axis] + 1}</span>
                    <button data-axis="${axis}" data-dir="1">+</button>
                </div>
            </div>
            <div class="slice-grid" id="${axis}-slice-grid"></div>`;
        panel.appendChild(view);
    });
    panel.querySelectorAll('.slice-controls button').forEach(btn => {
        btn.addEventListener('click', () => {
            const axis = btn.dataset.axis;
            const dir = parseInt(btn.dataset.dir);
            currentSlices[axis] = Math.max(0, Math.min(8, currentSlices[axis] + dir));
            updateAllSliceViews();
        });
    });
}

function isValidCell(x, y, z) {
    return (x === 0 || x === 8 || y === 0 || y === 8 || z === 0 || z === 8);
}

function updateSliceView(axis) {
    const grid = document.getElementById(`${axis}-slice-grid`);
    grid.innerHTML = '';
    const sliceIndex = currentSlices[axis];
    document.getElementById(`${axis}-slice-index`).innerText = sliceIndex + 1;
    for (let i = 0; i < 9; i++) { for (let j = 0; j < 9; j++) {
        const cell = document.createElement('div'); cell.className = 'cell';
        let x, y, z, val, initialVal;
        if (axis === 'x') { [x, y, z] = [sliceIndex, 8-i, j]; }
        if (axis === 'y') { [x, y, z] = [j, sliceIndex, 8-i]; }
        if (axis === 'z') { [x, y, z] = [j, 8-i, sliceIndex]; }
        if (!isValidCell(x, y, z)) {
            cell.classList.add('invalid'); grid.appendChild(cell); continue;
        }
        val = masterGrid[x][y][z]; initialVal = initialMasterGrid[x][y][z];
        if (val !== 0) {
            cell.innerText = val; cell.classList.add(val === initialVal ? 'initial' : 'user-input');
        }
        if (selectedCoords.x === x && selectedCoords.y === y && selectedCoords.z === z) {
            cell.classList.add('selected');
        }
        cell.addEventListener('click', () => {
            selectedCoords = {x, y, z}; currentSlices = {x, y, z}; updateAllSliceViews();
        });
        grid.appendChild(cell);
    }}
}

function updateAllSliceViews() {
    updateSliceView('x'); updateSliceView('y'); updateSliceView('z');
    updateSelectionBox();
}

function updateSelectionBox() {
    if (selectedCoords.x !== null) {
        selectionBox.position.set(selectedCoords.x - 4, selectedCoords.y - 4, selectedCoords.z - 4);
        selectionBox.visible = true;
    } else {
        selectionBox.visible = false;
    }
}

function animate() {
    requestAnimationFrame(animate); renderer.render(scene, camera);
}

function onMouseDown(event) {
    isDragging = true; previousMousePosition.x = event.clientX; previousMousePosition.y = event.clientY;
}
function onMouseUp(event) {
    isDragging = false;
}
function onMouseMove(event) {
    if (!isDragging) return;
    const deltaX = event.clientX - previousMousePosition.x, deltaY = event.clientY - previousMousePosition.y;
    const rotY = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), deltaX * 0.01);
    const rotX = new THREE.Quaternion().setFromAxisAngle(camera.localToWorld(new THREE.Vector3(1,0,0)).sub(camera.position).normalize(), deltaY * 0.01);
    sudokuGroup.quaternion.multiplyQuaternions(rotX, sudokuGroup.quaternion);
    sudokuGroup.quaternion.multiplyQuaternions(rotY, sudokuGroup.quaternion);
    previousMousePosition.x = event.clientX; previousMousePosition.y = event.clientY;
}

function onMouseWheel(event) {
    event.preventDefault(); camera.position.multiplyScalar(1 + event.deltaY * 0.001); camera.position.clampLength(15, 40);
}

function onKeyDown(event) {
    if (selectedCoords.x === null) return;
    const {x, y, z} = selectedCoords;
    if (!isValidCell(x,y,z) || initialMasterGrid[x][y][z] !== 0) return;
    const key = parseInt(event.key);
    if (!isNaN(key) && key > 0) {
        masterGrid[x][y][z] = key;
    } else if (event.key === 'Backspace' || event.key === 'Delete') {
        masterGrid[x][y][z] = 0;
    }
    draw3DNumbers(); updateAllSliceViews(); updateGameStats();
}

function onWindowResize() {
    const cubeContainer = document.getElementById('cube-container');
    if (cubeContainer.clientWidth === 0) return;
    camera.aspect = cubeContainer.clientWidth / cubeContainer.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(cubeContainer.clientWidth, cubeContainer.clientHeight);
}

init();