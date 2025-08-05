from flask import Flask, jsonify, send_from_directory, request
from flask_cors import CORS
import random
import os

app = Flask(__name__)
CORS(app)

@app.route('/')
def index():
    return send_from_directory('.', 'index.html')

@app.route('/<path:filename>')
def serve_static_files(filename):
    return send_from_directory('.', filename)

def is_valid(board, row, col, num):
    for i in range(9):
        if board[row][i] == num or board[i][col] == num:
            return False
    start_row, start_col = 3 * (row // 3), 3 * (col // 3)
    for i in range(3):
        for j in range(3):
            if board[i + start_row][j + start_col] == num:
                return False
    return True

def solve_sudoku(board):
    for row in range(9):
        for col in range(9):
            if board[row][col] == 0:
                for num in range(1, 10):
                    if is_valid(board, row, col, num):
                        board[row][col] = num
                        if solve_sudoku(board):
                            return True
                        board[row][col] = 0
                return False
    return True

def generate_full_board():
    """Generates a fully solved Sudoku board."""
    while True:
        board = [[0 for _ in range(9)] for _ in range(9)]
        for i in range(0, 9, 3):
            nums = list(range(1, 10))
            random.shuffle(nums)
            for row in range(3):
                for col in range(3):
                    board[i + row][i + col] = nums.pop()
        if solve_sudoku(board):
            return board

def create_puzzle_from_board(full_board, clue_count):
    """Creates a puzzle by selecting a specific number of clues from a solved board."""
    puzzle = [[0 for _ in range(9)] for _ in range(9)]
    all_cells = [(r, c) for r in range(9) for c in range(9)]
    random.shuffle(all_cells)
    
    for i in range(min(clue_count, len(all_cells))):
        r, c = all_cells[i]
        puzzle[r][c] = full_board[r][c]
        
    return puzzle


@app.route('/api/sudoku')
def get_sudoku_puzzle():
    difficulty = request.args.get('difficulty', default='medium', type=str)

    # --- NEW UNIFIED LOGIC ---
    # 1. Generate ONE master solution board to be used for all faces.
    #    This ensures all numbers on edges and corners are compatible.
    the_one_solution = generate_full_board()

    # 2. Define the number of clues to generate for each face.
    clue_map = {
        'easy': [5, 5, 5, 5, 5, 5],
        'medium': [3, 3, 2, 2, 1, 1],
        'hard': [2, 1, 1, 1, 1, 0],
        'expert': [3, 0, 0, 0, 0, 0]
    }
    clues_per_face = clue_map.get(difficulty, clue_map['medium'])
    random.shuffle(clues_per_face) # For non-easy/expert, randomize which face gets more clues

    # 3. Create the 6 puzzle faces from the single master solution.
    puzzles = []
    for clue_count in clues_per_face:
        puzzle = create_puzzle_from_board(the_one_solution, clue_count)
        puzzles.append({
            "solution": the_one_solution,
            "puzzle": puzzle
        })

    return jsonify(puzzles)

if __name__ == '__main__':
    app.run(debug=True)