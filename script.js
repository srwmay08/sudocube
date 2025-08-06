// --- Game State and Setup ---
let scene, camera, renderer, font;
let sudokuGroup, selectionHighlight, relatedHighlightGroup;
let isDragging = false;
let previousMousePosition = { x: 0, y: 0 };
let numberMeshes = [];

const masterGrid = Array(9).fill(0).map(() => Array(9).fill(0).map(() => Array(9).fill(0)));
const initialMasterGrid = Array(9).fill(0).map(() => Array(9).fill(0).map(() => Array(9).fill(0)));

let selectedCoords = { x: null, y: null, z: null };
let relatedCoords = [];
let currentSlices = { x: 4, y: 4, z: 4 };

// Hint System State
let currentHint = null;
let currentHintStep = 0;


// --- Core 3D and Game Logic ---

function createGridLines() {
    const thinLineMat = new THREE.LineBasicMaterial({ color: '#888' });
    const thickLineMat = new THREE.LineBasicMaterial({ color: '#ccc', linewidth: 2 });

    const thinVertices = [];
    const thickVertices = [];
    const half = 4.5;

    function addLine(vertices, p1, p2) {
        vertices.push(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
    }

    function generateFaceGrid(axis, fixedCoord) {
        const axis1 = (axis + 1) % 3;
        const axis2 = (axis + 2) % 3;

        for (let i = 0; i <= 9; i++) {
            const coord = i - half;
            const isThick = (i % 3 === 0);
            const vertices = isThick ? thickVertices : thinVertices;
            
            let p1 = new THREE.Vector3();
            let p2 = new THREE.Vector3();

            p1.setComponent(axis, fixedCoord).setComponent(axis1, coord).setComponent(axis2, -half);
            p2.setComponent(axis, fixedCoord).setComponent(axis1, coord).setComponent(axis2, half);
            addLine(vertices, p1, p2);

            p1.setComponent(axis, fixedCoord).setComponent(axis1, -half).setComponent(axis2, coord);
            p2.setComponent(axis, fixedCoord).setComponent(axis1, half).setComponent(axis2, coord);
            addLine(vertices, p1, p2);
        }
    }
    
    generateFaceGrid(0, -half); generateFaceGrid(0, half);
    generateFaceGrid(1, -half); generateFaceGrid(1, half);
    generateFaceGrid(2, -half); generateFaceGrid(2, half);

    const thinGeom = new THREE.BufferGeometry();
    thinGeom.setAttribute('position', new THREE.Float32BufferAttribute(thinVertices, 3));
    const thinLines = new THREE.LineSegments(thinGeom, thinLineMat);
    thinLines.renderOrder = 1;
    sudokuGroup.add(thinLines);

    const thickGeom = new THREE.BufferGeometry();
    thickGeom.setAttribute('position', new THREE.Float32BufferAttribute(thickVertices, 3));
    const thickLines = new THREE.LineSegments(thickGeom, thickLineMat);
    thickLines.renderOrder = 2;
    sudokuGroup.add(thickLines);
}

async function init() {
    // Basic scene setup
    const cubeContainer = document.getElementById('cube-container');
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, cubeContainer.clientWidth / cubeContainer.clientHeight, 0.1, 1000);
    camera.position.set(15, 15, 15);
    camera.lookAt(0, 0, 0);
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(cubeContainer.clientWidth, cubeContainer.clientHeight);
    cubeContainer.appendChild(renderer.domElement);
    
    // Create 3D objects
    sudokuGroup = new THREE.Group();
    const coreGeometry = new THREE.BoxGeometry(7, 7, 7);
    const coreMaterial = new THREE.MeshBasicMaterial({ color: 0x222222 });
    sudokuGroup.add(new THREE.Mesh(coreGeometry, coreMaterial));

    const cellGeom = new THREE.BoxGeometry(1, 1, 1);
    const cellFaceMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 });
    for (let x = 0; x < 9; x++) { for (let y = 0; y < 9; y++) { for (let z = 0; z < 9; z++) {
        if (x > 0 && x < 8 && y > 0 && y < 8 && z > 0 && z < 8) continue;
        const cellFace = new THREE.Mesh(cellGeom, cellFaceMat);
        cellFace.position.set(x - 4, y - 4, z - 4);
        sudokuGroup.add(cellFace);
    }}}
    
    createGridLines();

    const selectionGeom = new THREE.BoxGeometry(1.02, 1.02, 1.02);
    const selectionEdges = new THREE.EdgesGeometry(selectionGeom);
    const selectionMat = new THREE.LineBasicMaterial({ color: 0x4a90e2, linewidth: 2 });
    selectionHighlight = new THREE.LineSegments(selectionEdges, selectionMat);
    selectionHighlight.visible = false;
    selectionHighlight.renderOrder = 4;
    sudokuGroup.add(selectionHighlight);
    
    relatedHighlightGroup = new THREE.Group();
    relatedHighlightGroup.renderOrder = 3;
    sudokuGroup.add(relatedHighlightGroup);
    
    scene.add(sudokuGroup);
    
    // Setup UI and controls
    setupControlsPanel();
    setupGUI();
    setupHintModal();
    
    renderer.domElement.addEventListener('mousedown', onMouseDown);
    renderer.domElement.addEventListener('mouseup', onMouseUp);
    renderer.domElement.addEventListener('mousemove', onMouseMove);
    renderer.domElement.addEventListener('wheel', onMouseWheel);
    window.addEventListener('resize', onWindowResize);
    window.addEventListener('keydown', onKeyDown);
    
    onWindowResize();
    animate();

    const fontLoader = new THREE.FontLoader();
    fontLoader.load('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/fonts/helvetiker_regular.typeface.json', (loadedFont) => {
        font = loadedFont;
        loadPuzzles(document.getElementById('difficulty-select').value);
    });
}

async function loadPuzzles(difficulty = 'medium') {
    document.getElementById('loader').style.display = 'block';
    try {
        const response = await fetch(`http://127.0.0.1:5000/api/sudoku?difficulty=${difficulty}`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        for (let i = 0; i < 9; i++) { for (let j = 0; j < 9; j++) { for (let k = 0; k < 9; k++) {
            masterGrid[i][j][k] = 0;
            initialMasterGrid[i][j][k] = 0;
        }}}

        selectedCoords = { x: null, y: null, z: null };
        const facePuzzles = await response.json();
        mapFacesTo3DGrid(facePuzzles);
        document.getElementById('loader').style.display = 'none';
        draw3DNumbers();
        updateHighlights();
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
    for (let x=0; x<9; x++) { for (let y=0; y<9; y++) { for (let z=0; z<9; z++) {
        if (x > 0 && x < 8 && y > 0 && y < 8 && z > 0 && z < 8) continue;
        let val = 0;
        if (z === 8) val = faceMap[4][y][x];   if (z === 0) val = faceMap[5][y][8-x];
        if (x === 8) val = faceMap[0][y][8-z]; if (x === 0) val = faceMap[1][y][z];
        if (y === 8) val = faceMap[2][z][x];   if (y === 0) val = faceMap[3][8-z][x];
        if(val) { masterGrid[x][y][z] = val; initialMasterGrid[x][y][z] = val; }
    }}}
}

function draw3DNumbers() {
    numberMeshes.forEach(mesh => sudokuGroup.remove(mesh));
    numberMeshes = [];
    const textMatInitial = new THREE.MeshBasicMaterial({ color: 0xf0f0f0 });
    const textMatUser = new THREE.MeshBasicMaterial({ color: 0x4a90e2 });

    for (let x=0; x<9; x++) { for (let y=0; y<9; y++) { for (let z=0; z<9; z++) {
        const val = masterGrid[x][y][z];
        if (val !== 0) {
            const textGeom = new THREE.TextGeometry(val.toString(), { font: font, size: 0.6, height: 0.05 });
            textGeom.center();
            const isInitial = initialMasterGrid[x][y][z] !== 0;
            const mesh = new THREE.Mesh(textGeom, isInitial ? textMatInitial : textMatUser);
            mesh.position.set(x - 4, y - 4, z - 4);
            mesh.renderOrder = 2;
            sudokuGroup.add(mesh);
            numberMeshes.push(mesh);
        }
    }}}
}

function animate() {
    requestAnimationFrame(animate);
    const targetQuaternion = sudokuGroup.quaternion.clone().invert().multiply(camera.quaternion);
    numberMeshes.forEach(mesh => {
        mesh.quaternion.copy(targetQuaternion);
    });
    renderer.render(scene, camera);
}

// --- UI and CONTROLS ---

function setupGUI() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach(btn => btn.addEventListener('click', () => {
        document.querySelector('.tab-btn.active').classList.remove('active');
        btn.classList.add('active');
        document.querySelector('.tab-pane.active').classList.remove('active');
        document.getElementById(`${btn.dataset.tab}-tab`).classList.add('active');
    }));

    document.getElementById('new-game-btn').addEventListener('click', () => {
        loadPuzzles(document.getElementById('difficulty-select').value);
    });

    const gameTab = document.getElementById('game-tab');
    const hintButton = document.createElement('button');
    hintButton.id = 'hint-btn';
    hintButton.className = 'gui-button';
    hintButton.style.marginTop = '1rem';
    hintButton.innerText = 'Get a Hint';
    gameTab.appendChild(hintButton);
    hintButton.addEventListener('click', onHintClick);
}

// THIS FUNCTION'S BODY WAS MISSING AND IS NOW RESTORED
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
            // When user changes slice, deselect the current cell
            selectedCoords = { x: null, y: null, z: null };
            currentSlices[axis] = Math.max(0, Math.min(8, currentSlices[axis] + dir));
            updateHighlights();
        });
    });
}

function updateSliceView(axis) {
    const grid = document.getElementById(`${axis}-slice-grid`);
    grid.innerHTML = '';
    const sliceIndex = currentSlices[axis];
    document.getElementById(`${axis}-slice-index`).innerText = sliceIndex + 1;

    for (let i = 0; i < 9; i++) { for (let j = 0; j < 9; j++) {
        const cell = document.createElement('div');
        cell.className = 'cell';
        let x, y, z;
        if (axis === 'x') { [x, y, z] = [sliceIndex, 8 - i, j]; }
        if (axis === 'y') { [x, y, z] = [j, sliceIndex, 8 - i]; }
        if (axis === 'z') { [x, y, z] = [j, 8 - i, sliceIndex]; }

        if (!isValidCell(x, y, z)) {
            cell.classList.add('invalid');
            grid.appendChild(cell);
            continue;
        }

        const val = masterGrid[x][y][z];
        if (val !== 0) {
            cell.innerText = val;
            cell.classList.add(initialMasterGrid[x][y][z] !== 0 ? 'initial' : 'user-input');
        }

        if (selectedCoords.x === x && selectedCoords.y === y && selectedCoords.z === z) {
            cell.classList.add('selected');
        }
        if (relatedCoords.some(c => c.x === x && c.y === y && c.z === z)) {
            cell.classList.add('related');
        }

        cell.addEventListener('click', () => {
            selectedCoords = { x, y, z };
            currentSlices = { x, y, z };
            updateHighlights();
        });
        grid.appendChild(cell);
    }}
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

function onKeyDown(event) {
    if (selectedCoords.x === null) return;
    const { x, y, z } = selectedCoords;
    if (!isValidCell(x, y, z) || initialMasterGrid[x][y][z] !== 0) return;

    const key = parseInt(event.key);
    if (!isNaN(key) && key > 0) {
        masterGrid[x][y][z] = key;
    } else if (event.key === 'Backspace' || event.key === 'Delete') {
        masterGrid[x][y][z] = 0;
    } else {
        return;
    }
    draw3DNumbers();
    updateHighlights();
    updateGameStats();
}

function onMouseDown(event) { isDragging = true; previousMousePosition.x = event.clientX; previousMousePosition.y = event.clientY; }
function onMouseUp(event) { isDragging = false; }
function onMouseMove(event) {
    if (!isDragging) return;
    const deltaX = event.clientX - previousMousePosition.x, deltaY = event.clientY - previousMousePosition.y;
    const rotY = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), deltaX * 0.01);
    const rotX = new THREE.Quaternion().setFromAxisAngle(camera.localToWorld(new THREE.Vector3(1,0,0)).sub(camera.position).normalize(), deltaY * 0.01);
    sudokuGroup.quaternion.multiplyQuaternions(rotX, sudokuGroup.quaternion);
    sudokuGroup.quaternion.multiplyQuaternions(rotY, sudokuGroup.quaternion);
    previousMousePosition.x = event.clientX; previousMousePosition.y = event.clientY;
}
function onMouseWheel(event) { event.preventDefault(); camera.position.multiplyScalar(1 + event.deltaY * 0.001); camera.position.clampLength(15, 40); }
function onWindowResize() {
    const cubeContainer = document.getElementById('cube-container');
    if (cubeContainer.clientWidth === 0) return;
    camera.aspect = cubeContainer.clientWidth / cubeContainer.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(cubeContainer.clientWidth, cubeContainer.clientHeight);
}

// --- HIGHLIGHTING LOGIC ---

function getRelatedCells(sx, sy, sz) {
    if (sx === null) return [];
    const related = new Set();
    const add = (x, y, z) => {
        if (isValidCell(x, y, z)) related.add(JSON.stringify({ x, y, z }));
    };

    const faces = [];
    if (sy === 0 || sy === 8) faces.push('y');
    if (sx === 0 || sx === 8) faces.push('x');
    if (sz === 0 || sz === 8) faces.push('z');

    faces.forEach(faceAxis => {
        let x, y, z, blockXStart, blockYStart, blockZStart;
        if (faceAxis === 'y') {
            [y, x, z] = [sy, sx, sz];
            blockXStart = Math.floor(x / 3) * 3;
            blockZStart = Math.floor(z / 3) * 3;
            for (let i = 0; i < 9; i++) { add(i, y, z); add(x, y, i); }
            for (let i=0; i<3; i++) for (let j=0; j<3; j++) add(blockXStart+i, y, blockZStart+j);
        } else if (faceAxis === 'x') {
            [x, y, z] = [sx, sy, sz];
            blockYStart = Math.floor(y / 3) * 3;
            blockZStart = Math.floor(z / 3) * 3;
            for (let i = 0; i < 9; i++) { add(x, i, z); add(x, y, i); }
            for (let i=0; i<3; i++) for (let j=0; j<3; j++) add(x, blockYStart+i, blockZStart+j);
        } else { // faceAxis === 'z'
            [z, x, y] = [sz, sx, sy];
            blockXStart = Math.floor(x / 3) * 3;
            blockYStart = Math.floor(y / 3) * 3;
            for (let i = 0; i < 9; i++) { add(i, y, z); add(x, i, z); }
            for (let i=0; i<3; i++) for (let j=0; j<3; j++) add(blockXStart+i, blockYStart+j, z);
        }
    });

    related.delete(JSON.stringify({ x: sx, y: sy, z: sz }));
    return Array.from(related).map(s => JSON.parse(s));
}

function updateHighlights() {
    selectionHighlight.visible = false;
    while (relatedHighlightGroup.children.length > 0) {
        relatedHighlightGroup.remove(relatedHighlightGroup.children[0]);
    }
    relatedCoords = [];

    if (selectedCoords.x !== null) {
        const { x, y, z } = selectedCoords;
        selectionHighlight.position.set(x - 4, y - 4, z - 4);
        selectionHighlight.visible = true;

        relatedCoords = getRelatedCells(x, y, z);
        const highlightMat = new THREE.MeshBasicMaterial({ color: 0x4a90e2, transparent: true, opacity: 0.2 });
        const highlightGeom = new THREE.BoxGeometry(1, 1, 1);

        relatedCoords.forEach(coord => {
            const mesh = new THREE.Mesh(highlightGeom, highlightMat);
            mesh.position.set(coord.x - 4, coord.y - 4, coord.z - 4);
            relatedHighlightGroup.add(mesh);
        });
    }
    
    updateAllSliceViews();
}

function updateAllSliceViews() {
    updateSliceView('x'); updateSliceView('y'); updateSliceView('z');
}

// --- HINT LOGIC ---

function setupHintModal() {
    document.getElementById('hint-prev-btn').addEventListener('click', () => {
        currentHintStep = Math.max(0, currentHintStep - 1);
        displayHintStep();
    });
    document.getElementById('hint-next-btn').addEventListener('click', () => {
        currentHintStep = Math.min(2, currentHintStep + 1);
        displayHintStep();
    });
    document.getElementById('hint-complete-btn').addEventListener('click', () => {
        if (currentHint) {
            const { x, y, z } = currentHint.coords;
            masterGrid[x][y][z] = currentHint.solution;
            draw3DNumbers();
            selectedCoords = { x: null, y: null, z: null }; // Deselect after hint
            updateHighlights();
        }
        closeHintModal();
    });
}

function onHintClick() {
    const hint = findNakedSingle();
    if (hint) {
        currentHint = hint;
        currentHintStep = 0;
        selectedCoords = hint.coords;
        updateHighlights();
        displayHintStep();
        document.getElementById('hint-modal-overlay').style.display = 'flex';
    } else {
        alert("Sorry, no simple hints were found!");
    }
}

function findNakedSingle() {
    for (let x=0; x<9; x++) { for (let y=0; y<9; y++) { for (let z=0; z<9; z++) {
        if (!isValidCell(x, y, z) || masterGrid[x][y][z] !== 0) continue;

        const related = getRelatedCells(x, y, z);
        const peerValues = new Set();
        related.forEach(c => {
            const val = masterGrid[c.x][c.y][c.z];
            if (val !== 0) peerValues.add(val);
        });

        if (peerValues.size === 8) {
            for (let i = 1; i <= 9; i++) {
                if (!peerValues.has(i)) {
                    return {
                        type: 'NakedSingle',
                        coords: { x, y, z },
                        solution: i,
                        peers: Array.from(peerValues),
                    };
                }
            }
        }
    }}}
    return null;
}

function displayHintStep() {
    const titleEl = document.getElementById('hint-title');
    const textEl = document.getElementById('hint-text');
    const indicatorEl = document.getElementById('hint-step-indicator');
    const prevBtn = document.getElementById('hint-prev-btn');
    const nextBtn = document.getElementById('hint-next-btn');

    titleEl.innerText = "Last Possible Number";
    indicatorEl.innerHTML = '';
    for (let i = 0; i < 3; i++) {
        const dot = document.createElement('div');
        dot.className = 'step-dot';
        if (i === currentHintStep) dot.classList.add('active');
        indicatorEl.appendChild(dot);
    }
    
    switch (currentHintStep) {
        case 0:
            textEl.innerHTML = "Pay attention to <b>this cell</b> and the numbers in the highlighted areas.";
            break;
        case 1:
            const peers = currentHint.peers.sort((a,b)=>a-b).join(', ');
            textEl.innerHTML = `Numbers <b>${peers}</b> are already used in its row, column, or block.`;
            break;
        case 2:
            textEl.innerHTML = `Since the only number missing is <b>${currentHint.solution}</b>, this cell must be <b>${currentHint.solution}</b>.`;
            break;
    }
    prevBtn.disabled = currentHintStep === 0;
    nextBtn.disabled = currentHintStep === 2;
}

function closeHintModal() {
    document.getElementById('hint-modal-overlay').style.display = 'none';
    currentHint = null;
}

// --- UTILITIES ---
function isValidCell(x, y, z) {
    return (x === 0 || x === 8 || y === 0 || y === 8 || z === 0 || z === 8);
}

// Start the app
window.addEventListener('DOMContentLoaded', (event) => {
    init();
});