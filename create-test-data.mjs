import fetch from 'node-fetch';
import FormData from 'form-data';
import fs from 'fs';
import path from 'path';

const BASE_URL = process.env.BASE_URL || 'http://localhost:5401';

// Create Item
async function createProject(title) {
  const response = await fetch(`${BASE_URL}/api/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      creation_type: 'idea',
      idea_prompt: title,
      template_style: 'Brief business style',
      image_aspect_ratio: '16:9'
    })
  });
  const data = await response.json();
  return data.data.project_id;
}

// Create temporary test file
function createTempFile(filename, content) {
  const tempDir = '/tmp/test-attachments';
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  const filepath = path.join(tempDir, filename);
  fs.writeFileSync(filepath, content);
  return filepath;
}

// Uploading reference files
async function uploadFile(projectId, filename, content) {
  const filepath = createTempFile(filename, content);
  const formData = new FormData();
  formData.append('file', fs.createReadStream(filepath));
  if (projectId) {
    formData.append('project_id', projectId);
  }

  const response = await fetch(`${BASE_URL}/api/reference-files`, {
    method: 'POST',
    body: formData
  });

  fs.unlinkSync(filepath);
  return response.json();
}

async function main() {
  console.log('Creating test projects and attachments...\n');

  const projects = [
    'Presentation of the product',
    'Quarterly performance reports',
    'Marketing strategy',
    'Technical architecture design',
    'Team training materials'
  ];

  for (const title of projects) {
    console.log(`Creating project: ${title}`);
    const projectId = await createProject(title);

    // Upload for each item 2-3 A file
    const fileCount = Math.floor(Math.random() * 2) + 2;
    for (let i = 0; i < fileCount; i++) {
      const filename = `${title.substring(0, 4)}_Documentation${i + 1}.txt`;
      const content = `It’s... ${title} reference document ${i + 1}\n Created: ${new Date().toISOString()}`;
      await uploadFile(projectId, filename, content);
      console.log(`  - Uploaded: ${filename}`);
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }

  // Upload some global files (unconnected items)）
  console.log('\nCreating global attachments...');
  const globalFiles = ['Generic Templates.txt', 'Company Logo Annotations.txt', 'Brand guidelines.txt'];
  for (const filename of globalFiles) {
    await uploadFile(null, filename, `Global File: ${filename}\n${new Date().toISOString()}`);
    console.log(`  - Uploaded: ${filename}`);
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  console.log('\n✅ Test data created successfully!');
}

main().catch(console.error);
