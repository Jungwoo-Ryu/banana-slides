"""GPT Image 2 reference images remain ordered and isolated to Azure."""
import base64
from io import BytesIO
from types import SimpleNamespace
from unittest.mock import MagicMock
import pytest
from PIL import Image
from services.ai_providers.image.azure_provider import AzureImageProvider,image_size


def provider():
    value=AzureImageProvider.__new__(AzureImageProvider)
    value.client=MagicMock();value.request_model='company-image';value.image_quality='high'
    return value


def test_template_and_material_references_are_forwarded_in_order():
    p=provider();colors=[]
    def edit(**kwargs):
        assert kwargs['model']=='company-image' and kwargs['quality']=='high'
        for _,buffer,_ in kwargs['image']:
            with Image.open(buffer) as image: colors.append(image.convert('RGB').getpixel((0,0)))
        buffer=BytesIO();Image.new('RGB',(32,32),'white').save(buffer,format='PNG')
        return SimpleNamespace(data=[SimpleNamespace(b64_json=base64.b64encode(buffer.getvalue()).decode())])
    p.client.images.edit.side_effect=edit
    sources=[Image.new('RGB',(32,32),'red'),Image.new('P',(32,32))]
    result=p.generate_image('slide',sources)
    assert result.size==(32,32) and colors[0]==(255,0,0) and len(colors)==2
    # Caller-owned images stay usable after generation.
    assert sources[0].getpixel((0,0))==(255,0,0)


def test_more_than_sixteen_references_are_rejected_before_api_call():
    p=provider()
    with pytest.raises(ValueError): p.generate_image('slide',[Image.new('RGB',(16,16))]*17)
    p.client.images.edit.assert_not_called()


@pytest.mark.parametrize('ratio,resolution',[('16:9','1K'),('9:16','2K'),('1:1','4K'),('3:1','4K')])
def test_output_size_is_aligned_and_bounded(ratio,resolution):
    w,h=map(int,image_size(ratio,resolution).split('x'))
    assert w%16==h%16==0 and max(w,h)<=3840 and w*h<=8_294_400


@pytest.mark.parametrize('ratio',['0:1','nan:1','4:1','invalid'])
def test_invalid_ratios_are_rejected(ratio):
    with pytest.raises(ValueError): image_size(ratio,'2K')
