#!/bin/bash
BASE_URL="http://localhost:5401"

echo "Creating test projects and attachments..."

# Create items and upload files
projects=("Presentation of the product" "Quarterly performance reports" "Marketing strategy" "Technical architecture design" "Team training materials")

for title in "${projects[@]}"; do
  echo -e "\nCreating project: $title"

  # Create Item
  response=$(curl -s -X POST "$BASE_URL/api/projects" \
    -H "Content-Type: application/json" \
    -d "{\"creation_type\":\"idea\",\"idea_prompt\":\"$title\",\"template_style\":\"Brief business style\",\"image_aspect_ratio\":\"16:9\"}")

  project_id=$(echo $response | grep -o '"project_id":"[^"]*"' | cut -d'"' -f4)

  if [ -n "$project_id" ]; then
    # Upload for each item 2-3 A file
    for i in {1..3}; do
      filename="${title:0:8}_Documentation${i}.txt"
      echo "It’s... $title reference document $i" > /tmp/test_file.txt

      curl -s -X POST "$BASE_URL/api/reference-files" \
        -F "file=@/tmp/test_file.txt;filename=$filename" \
        -F "project_id=$project_id" > /dev/null

      echo "  - Uploaded: $filename"
      sleep 0.2
    done
  fi
done

# Upload global files
echo -e "\nCreating global attachments..."
for name in "Generic Templates" "Company Logo Annotations" "Brand guidelines"; do
  filename="${name}.txt"
  echo "Global File: $filename" > /tmp/test_file.txt

  curl -s -X POST "$BASE_URL/api/reference-files" \
    -F "file=@/tmp/test_file.txt;filename=$filename" > /dev/null

  echo "  - Uploaded: $filename"
  sleep 0.2
done

rm -f /tmp/test_file.txt
echo -e "\n✅ Test data created successfully!"
