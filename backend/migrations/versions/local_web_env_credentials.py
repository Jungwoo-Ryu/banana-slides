"""Remove persisted credentials and obsolete provider selections.

Keys must be supplied again through environment variables or mounted secret files.
"""
from alembic import op
import sqlalchemy as sa
revision = 'local_web_env_credentials'
down_revision = 'd84c2a7f9130'
branch_labels = None
depends_on = None
COLUMNS = ['api_key', 'text_api_key', 'image_api_key', 'image_caption_api_key', 'mineru_token', 'baidu_api_key', 'lazyllm_api_keys', 'elevenlabs_api_key', 'openai_oauth_access_token', 'openai_oauth_refresh_token', 'openai_oauth_account_id', 'openai_oauth_expires_at']

def upgrade():
    connection = op.get_bind()
    columns = {c['name'] for c in sa.inspect(connection).get_columns('settings')}
    # SQLite clears deleted content from pages when removing legacy credentials.
    if connection.dialect.name == 'sqlite':
        connection.exec_driver_sql('PRAGMA secure_delete=ON')
    with op.batch_alter_table('settings') as batch:
        for name in COLUMNS:
            if name in columns:
                batch.drop_column(name)
    connection.execute(sa.text("UPDATE projects SET export_extractor_method='configured', export_inpaint_method='local', enable_icon_subject_extraction=0"))
    for role in ('text', 'image', 'image_caption'):
        # Do not reuse a removed vendor's URL with a new provider's credentials.
        connection.execute(sa.text(f"UPDATE settings SET {role}_api_base_url=NULL WHERE {role}_model_source NOT IN ('azure','openai','gemini','vertex','anthropic')"))
        for hostname in ('apimart.ai','inferera.com','volcengine','dashscope','bigmodel.cn'):
            connection.execute(sa.text(f"UPDATE settings SET {role}_api_base_url=NULL WHERE lower({role}_api_base_url) LIKE :hostname"), {'hostname': f'%{hostname}%'})
    for name in ('ai_provider_format','text_model_source','image_model_source','image_caption_model_source'):
        connection.execute(sa.text(f"UPDATE settings SET {name}=NULL WHERE {name} NOT IN ('azure','openai','gemini','vertex','anthropic')"))
    connection.execute(sa.text("UPDATE settings SET output_language='ko' WHERE output_language NOT IN ('ko','en','auto')"))

def downgrade():
    # Recreate empty columns only; deleted credentials cannot be recovered.
    with op.batch_alter_table('settings') as batch:
        for name in COLUMNS:
            batch.add_column(sa.Column(name, sa.DateTime() if name.endswith('expires_at') else sa.Text(), nullable=True))
