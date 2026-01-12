# Product Promotional Page

This is a dynamic web application that displays products from a Google Spreadsheet.

## Setup
1. **Google Sheet**: Ensure your Google Sheet is shared as "Anyone with the link can view".
2. **Data Columns**: The app looks for columns named roughly "Product Name" (or "Name") and "No" (or "Number", "ID").
3. **Configuration**: If you need to change the Sheet ID, edit `app.js` and update `SHEET_ID`.

## Adding Product Images
The app is designed to look for images in the `images/` folder.
1. Download your images from your Google Drive.
2. Ensure they are named using the product number (e.g., `PTSTLS-1225-011.png` or `PTSTLS-1225-011.jpg`).
3. Place them in the `images/` folder inside this project.
4. The app will automatically detect them. If an image is missing, a placeholder will be shown.

## Deployment to GitHub Pages
1. Initialize a git repository and commit your files (including the `images` folder!).
2. Push to GitHub.
3. Enable GitHub Pages in Settings.

## Local Development
To run locally, you need a local server (due to CORS policies).
If you have Python installed:
```bash
python -m http.server
```
Then open `http://localhost:8000`.
