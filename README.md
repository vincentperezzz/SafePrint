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
   git clone https://github.com/vincentperezzz/SafePrint.git
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

4. Install MySQL:
   Use the Windows Package Manager (`winget`) to install MySQL:
   ```
   winget install --id Oracle.MySQL
   ```
   Alternatively, download and install MySQL manually from [MySQL Downloads](https://dev.mysql.com/downloads/installer/).

5. Configure the `.env` file:
   Create a `.env` file inside the `venv` folder with the following content:
   ```
   DJANGO_SECRET_KEY=your-secret-key
   DB_NAME=your_database_name
   DB_USER=your_database_user
   DB_PASSWORD=your_database_password
   DB_HOST=localhost
   DB_PORT=3306
   ```

6. Install dependencies:
   Activate the virtual environment and install the required Python packages:
   ```
   python -m venv venv
   ```
   ```
   venv\Scripts\activate
   ```
   ```
   pip install -r requirements.txt
   ```

7. Apply migrations:
   Run the following commands to set up the database schema:
   ```
   python manage.py makemigrations
   ```
   ```
   python manage.py migrate
   ```

8. Start the development server:
   ```
   python manage.py runserver
   ```

9. Create a superuser (optional):
   If you want to access the admin interface, create a superuser account:
   ```
   python manage.py createsuperuser
   ```

10. Create Manager account (only for fresh installations):
    ```
      python manage.py shell
      ```
      Then run the following commands in the Django shell:
      ```python
      from portal.models import AdminUser
      from django.contrib.auth.hashers import make_password

      AdminUser.objects.create(
          name='Manager Name',
          username='manager',
          password=make_password('your_secure_password'),
          role='Manager'
      )
      ```

11. Access the application:
   Open your browser and navigate to `http://127.0.0.1:8000/`.

## Database Setup

1. **Install MySQL Workbench**:
   Download and install MySQL Workbench from [MySQL Workbench Downloads](https://dev.mysql.com/downloads/workbench/).

2. **Create the Database**:
   - Open MySQL Workbench and connect to your MySQL server.
   - Create the database and tables

3. **Apply Migrations**:
   Run the following commands to apply migrations:
   ```
   python manage.py makemigrations
   python manage.py migrate
   ```

This ensures users can set up the database using MySQL Workbench and configure the Django project accordingly. Let me know if you need further adjustments!
## Notes
- Ensure MySQL is running before starting the Django server.
- The `.env` file is excluded from version control for security purposes.

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



