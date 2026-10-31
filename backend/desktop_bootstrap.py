"""Desktop-only startup compatibility helpers."""
import logging
from sqlalchemy import inspect as sqlalchemy_inspect, text


def repair_desktop_settings_schema(db):
    """Repair columns for desktop databases created by older builds."""
    repair_specs = {
        'settings': {
            'design_system_prompt': 'TEXT',
            'text_max_output_tokens': 'INTEGER',
            'description_extra_fields': 'TEXT',
            'image_prompt_extra_fields': 'TEXT',
        },
        'projects': {
            'project_title': 'VARCHAR(255)',
            'outline_requirements': 'TEXT',
            'description_requirements': 'TEXT',
            'template_style': 'TEXT',
            'template_mode': "VARCHAR(20) DEFAULT 'single'",
            'export_extractor_method': "VARCHAR(50) DEFAULT 'hybrid'",
            'export_inpaint_method': "VARCHAR(50) DEFAULT 'hybrid'",
            'export_allow_partial': 'BOOLEAN DEFAULT 0',
            'enable_icon_subject_extraction': 'BOOLEAN DEFAULT 1',
            'image_aspect_ratio': "VARCHAR(10) DEFAULT '16:9'",
        },
        'pages': {
            'cached_image_path': 'VARCHAR(500)',
            'narration_text': 'TEXT',
            'template_asset_id': 'VARCHAR(36)',
            'template_style_text': 'TEXT',
            'template_selection_source': 'VARCHAR(20)',
            'template_match_reason': 'TEXT',
            'template_match_confidence': 'FLOAT',
        },
        'user_templates': {
            'thumb_path': 'VARCHAR(500)',
            'file_size': 'INTEGER',
        },
        'materials': {
            'caption': 'VARCHAR(500)',
            'original_filename': 'VARCHAR(500)',
        },
        'reference_files': {
            'mineru_batch_id': 'VARCHAR(100)',
        },
        'tasks': {
            'completed_at': 'DATETIME',
        },
        'user_style_templates': {
            'color': 'VARCHAR(20)',
        },
    }

    repaired = {}
    with db.engine.begin() as conn:
        inspector = sqlalchemy_inspect(conn)
        existing_tables = set(inspector.get_table_names())
        for table_name, required_columns in repair_specs.items():
            if table_name not in existing_tables:
                continue
            existing_columns = {column['name'] for column in inspector.get_columns(table_name)}
            for column_name, column_type in required_columns.items():
                if column_name in existing_columns:
                    continue
                conn.execute(text(f'ALTER TABLE {table_name} ADD COLUMN {column_name} {column_type}'))
                repaired.setdefault(table_name, []).append(column_name)

        settings_columns = set()
        if 'settings' in existing_tables:
            settings_columns = {column['name'] for column in inspector.get_columns('settings')}
        if 'baidu_api_key' in repaired.get('settings', []) and 'baidu_ocr_api_key' in settings_columns:
            conn.execute(text(
                'UPDATE settings SET baidu_api_key = baidu_ocr_api_key '
                'WHERE baidu_api_key IS NULL AND baidu_ocr_api_key IS NOT NULL'
            ))

    if repaired:
        details = '; '.join(f"{table}: {', '.join(columns)}" for table, columns in repaired.items())
        logging.info(f"Repaired desktop database schema, added columns: {details}")
