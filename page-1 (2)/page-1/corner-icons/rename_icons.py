import os

directory = r'c:\Users\Agnid\Downloads\page-1 (latest])\page-1\ICONS2'
files = os.listdir(directory)

for filename in files:
    if filename == 'rename_icons.py':
        continue
    
    new_name = filename.replace(' ', '')
    if new_name != filename:
        old_path = os.path.join(directory, filename)
        new_path = os.path.join(directory, new_name)
        
        # Handle conflicts
        if os.path.exists(new_path):
            base, ext = os.path.splitext(new_name)
            counter = 1
            while os.path.exists(os.path.join(directory, f"{base}_{counter}{ext}")):
                counter += 1
            new_path = os.path.join(directory, f"{base}_{counter}{ext}")
            new_name = f"{base}_{counter}{ext}"
            
        print(f"Renaming '{filename}' to '{new_name}'")
        os.rename(old_path, new_path)
