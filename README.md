# SafePrint Project

## Overview
SafePrint is a Django web application designed to provide a secure and efficient printing solution. This project aims to streamline the printing process while ensuring user data is handled safely.

## Features
- User authentication and authorization
- Secure document upload and management
- Print job tracking
- User-friendly interface

## Installation

1. Clone the repository:
   ```
   git clone https://github.com/yourusername/SafePrint.git
   ```

2. Navigate to the project directory:
   ```
   cd SafePrint
   ```

3. Set the execution policy (Windows only):
   Run the following command in PowerShell to allow script execution:
   ```
   Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
   ```

4. Create a virtual environment:
   ```
   python -m venv venv
   ```

5. Activate the virtual environment:
   - On Windows:
     ```
     venv\Scripts\activate
     ```
   - On macOS/Linux:
     ```
     source venv/bin/activate
     ```

6. Install the required packages:
   ```
   pip install -r requirements.txt
   ```

## Usage

1. Run the migrations:
   ```
   python manage.py migrate
   ```

2. Start the development server:
   ```
   python manage.py runserver
   ```

3. Access the application at `http://127.0.0.1:8000/`.

## Contributing
Contributions are welcome! Please open an issue or submit a pull request for any improvements or features.

## License
This project is licensed under the MIT License. See the LICENSE file for details.