"""Remove model/vendor selectors and add the shared design-system prompt."""
from alembic import op
import sqlalchemy as sa
revision = 'sola_azure_only'
down_revision = 'local_web_env_credentials'
branch_labels = None
depends_on = None
REMOVED = ['ai_provider_format', 'api_base_url', 'text_model', 'image_model', 'image_caption_model', 'text_model_source', 'image_model_source', 'image_caption_model_source', 'text_api_base_url', 'image_api_base_url', 'image_caption_api_base_url', 'openai_image_api_protocol', 'elevenlabs_enabled', 'elevenlabs_voice_id', 'enable_text_reasoning', 'enable_image_reasoning', 'text_thinking_budget', 'image_thinking_budget']


def upgrade():
    columns = {c['name'] for c in sa.inspect(op.get_bind()).get_columns('settings')}
    with op.batch_alter_table('settings') as batch:
        for name in REMOVED:
            if name in columns:
                batch.drop_column(name)
        batch.add_column(sa.Column('design_system_prompt', sa.Text(), nullable=True))
    if 'image_quality' in columns:
        op.get_bind().execute(sa.text("UPDATE settings SET image_quality='high' WHERE image_quality IN ('xhigh','max')"))


def downgrade():
    with op.batch_alter_table('settings') as batch:
        batch.drop_column('design_system_prompt')
        for name in REMOVED:
            kind = sa.Boolean() if name.startswith('enable_') or name == 'elevenlabs_enabled' else sa.Integer() if name.endswith('budget') else sa.String(500)
            batch.add_column(sa.Column(name, kind, nullable=True))
