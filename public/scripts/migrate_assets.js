const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// CONFIGURATION
const ASSETS_REPO_NAME = 'crtv-rarities-assets';
const GITHUB_USERNAME = '3omarhs';
const SOURCE_DIR = path.join(__dirname, '..', 'public', 'assets', 'products');
const TARGET_DIR = path.join(__dirname, '..', ASSETS_REPO_NAME);

async function migrate() {
    console.log('--- Starting Assets Migration ---');

    // 1. Create target directory
    if (!fs.existsSync(TARGET_DIR)) {
        fs.mkdirSync(TARGET_DIR);
    }

    // 2. Initialize new Git repo
    process.chdir(TARGET_DIR);
    try {
        execSync('git init');
        execSync(`git remote add origin https://github.com/${GITHUB_USERNAME}/${ASSETS_REPO_NAME}.git`);
    } catch (e) {
        console.log('Repo already initialized or remote exists.');
    }

    // 3. Move images
    console.log(`Moving images from ${SOURCE_DIR} to ${TARGET_DIR}...`);
    const files = fs.readdirSync(SOURCE_DIR);
    files.forEach(file => {
        fs.copyFileSync(path.join(SOURCE_DIR, file), path.join(TARGET_DIR, file));
    });

    // 4. Push to GitHub
    console.log('Pushing to GitHub...');
    execSync('git add .');
    execSync('git commit -m "Initial assets upload"');
    execSync('git branch -M main');
    execSync('git push -u origin main');

    console.log('\n--- MIGRATION COMPLETE ---');
    console.log(`Your assets are now live at: https://github.com/${GITHUB_USERNAME}/${ASSETS_REPO_NAME}`);
}

migrate();
