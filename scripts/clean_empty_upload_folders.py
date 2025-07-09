import os

UPLOADS_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '../media/uploads'))

if not os.path.exists(UPLOADS_DIR):
    print(f"Uploads directory does not exist: {UPLOADS_DIR}")
    exit(0)

found_empty = False
for d in os.listdir(UPLOADS_DIR):
    dir_path = os.path.join(UPLOADS_DIR, d)
    if os.path.isdir(dir_path) and not os.listdir(dir_path):
        try:
            os.rmdir(dir_path)
            print(f"Deleted empty folder: {dir_path}")
            found_empty = True
        except Exception as e:
            print(f"Failed to delete {dir_path}: {e}")
if not found_empty:
    print("No empty folders found in uploads.")
