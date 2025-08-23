import os
import sys
import argparse


UPLOADS_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '../media/uploads'))


def setup_django():
    """Initialize Django so we can query the database models."""
    try:
        # Project root (one level up from scripts/)
        project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
        if project_root not in sys.path:
            sys.path.insert(0, project_root)

        os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'SafePrint.settings')
        import django  # type: ignore
        django.setup()
    except Exception as e:
        print(f"Failed to initialize Django: {e}")
        sys.exit(1)


def get_valid_stored_names():
    """Return a set of stored filenames that are referenced by Document records."""
    try:
        from portal.models import Document  # Local import after Django setup
        names = set(
            n for n in Document.objects.values_list('stored_name', flat=True)
            if n
        )
        return names
    except Exception as e:
        print(f"Failed to fetch Document filenames from DB: {e}")
        sys.exit(1)


def delete_orphan_files(valid_names, dry_run=False):
    """
    Delete files under media/uploads/<session_key>/ that are not referenced in the DB.
    Returns the count of deleted files.
    """
    deleted = 0
    if not os.path.exists(UPLOADS_DIR):
        print(f"Uploads directory does not exist: {UPLOADS_DIR}")
        return deleted

    for entry in os.listdir(UPLOADS_DIR):
        dir_path = os.path.join(UPLOADS_DIR, entry)
        if not os.path.isdir(dir_path):
            continue

        try:
            for fname in os.listdir(dir_path):
                file_path = os.path.join(dir_path, fname)
                if not os.path.isfile(file_path):
                    continue
                if fname not in valid_names:
                    if dry_run:
                        print(f"[DRY-RUN] Would delete orphan file: {file_path}")
                    else:
                        try:
                            os.remove(file_path)
                            print(f"Deleted orphan file: {file_path}")
                            deleted += 1
                        except Exception as e:
                            print(f"Failed to delete file {file_path}: {e}")
        except Exception as e:
            print(f"Failed to list directory {dir_path}: {e}")

    return deleted


def delete_empty_upload_folders():
    """Delete empty subfolders under media/uploads and return count of removed folders."""
    removed = 0
    if not os.path.exists(UPLOADS_DIR):
        return removed

    for d in os.listdir(UPLOADS_DIR):
        dir_path = os.path.join(UPLOADS_DIR, d)
        if os.path.isdir(dir_path) and not os.listdir(dir_path):
            try:
                os.rmdir(dir_path)
                print(f"Deleted empty folder: {dir_path}")
                removed += 1
            except Exception as e:
                print(f"Failed to delete {dir_path}: {e}")
    return removed


def main():
    parser = argparse.ArgumentParser(description='Clean orphan uploads and empty folders.')
    parser.add_argument('--dry-run', action='store_true', help='Show what would be deleted without removing files')
    args = parser.parse_args()

    if not os.path.exists(UPLOADS_DIR):
        print(f"Uploads directory does not exist: {UPLOADS_DIR}")
        sys.exit(0)

    setup_django()
    valid_names = get_valid_stored_names()
    print(f"Found {len(valid_names)} file references in DB.")

    deleted_files = delete_orphan_files(valid_names, dry_run=args.dry_run)
    if args.dry_run:
        print(f"[DRY-RUN] Orphan files that would be deleted: {deleted_files}")
    else:
        print(f"Orphan files deleted: {deleted_files}")

    removed_folders = delete_empty_upload_folders()
    if removed_folders == 0:
        print("No empty folders found in uploads.")
    else:
        print(f"Empty folders deleted: {removed_folders}")


if __name__ == '__main__':
    main()
