from flask import Flask, jsonify
from flask_cors import CORS
import random

app = Flask(__name__)
CORS(app)  # This allows the frontend to make requests to this server

def is_valid(board, row, col, num):
    """Checks if it's valid to place a number in a given cell."""
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
    """Solves a Sudoku board using backtracking."""
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

def generate_puzzle(difficulty=0.5):
    """Generates a Sudoku puzzle."""
    # Start with an empty board
    board = [[0 for _ in range(9)] for _ in range(9)]

    # Fill the diagonal 3x3 boxes
    for i in range(0, 9, 3):
        nums = list(range(1, 10))
        random.shuffle(nums)
        for row in range(3):
            for col in range(3):
                board[i + row][i + col] = nums.pop()

    # Solve the full board
    solve_sudoku(board)
    
    # Create the puzzle by removing numbers
    puzzle = [row[:] for row in board] # Make a copy
    for row in range(9):
        for col in range(9):
            if random.random() < difficulty:
                puzzle[row][col] = 0
                
    return {
        "solution": board,
        "puzzle": puzzle
    }


@app.route('/api/sudoku')
def get_sudoku_puzzle():
    """API endpoint to get a new Sudoku puzzle."""
    # We need 6 puzzles, one for each face of the cube
    puzzles = [generate_puzzle() for _ in range(6)]
    return jsonify(puzzles)

if __name__ == '__main__':
    # To run this:
    # 1. Install Flask and Flask-Cors: pip install Flask Flask-Cors
    # 2. Run the script: python your_script_name.py
    # 3. The API will be available at http://127.0.0.1:5000/api/sudoku
    app.run(debug=True)
