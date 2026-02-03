import os
import re

def fix_admin_js():
    file_path = 'admin.js'
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # We look for the start of the block and the next section header
        start_marker = "const loginForm = document.getElementById('login-form');"
        end_marker = "// Navigation Handler"
        
        # Find start
        start_idx = content.find(start_marker)
        if start_idx == -1:
            print("Could not find start marker")
            return
        
        # Find end
        end_idx = content.find(end_marker, start_idx)
        if end_idx == -1:
            print("Could not find end marker")
            return
            
        # The clean code to insert
        clean_code = """const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            
            if (ADMIN_USERS.length === 0) {
                 alert("System Error: No admin users loaded. Check console.");
                 return;
            }

            const email = document.getElementById('admin-email').value;
            const pass = document.getElementById('admin-password').value;
            const err = document.getElementById('login-error');

            console.log("Admin: Login Attempt:", { email });

            const validUser = ADMIN_USERS.find(u => 
                u.email === email.trim().toLowerCase() && u.pass === pass.trim()
            );

            if (validUser) {
                sessionStorage.setItem('admin_logged_in', 'true');
                if (err) err.classList.add('hidden');
                showDashboard();
            } else {
                console.warn("Admin: Login Failed");
                if (err) err.classList.remove('hidden');
            }
        });
    }

"""
        
        # Construct new content
        # We need to preserve indentation of start marker? It looks like 4 spaces based on context
        # But let's just use what we have.
        
        pre_content = content[:start_idx]
        post_content = content[end_idx:]
        
        new_content = pre_content + clean_code + post_content
        
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(new_content)
            
        print("Successfully fixed admin.js")
        
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    fix_admin_js()
