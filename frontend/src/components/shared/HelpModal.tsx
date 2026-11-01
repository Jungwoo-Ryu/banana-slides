import { Modal } from './Modal';
export const HelpModal = ({isOpen,onClose}: {isOpen:boolean;onClose:()=>void}) => <Modal isOpen={isOpen} onClose={onClose} title="사용 방법">
  <div className="space-y-4 p-2 text-sm leading-7">
    <p>1. 설정에서 모델 연결 상태를 확인하세요.</p><p>2. 주제나 참고 문서를 넣고 개요를 생성하세요.</p><p>3. 페이지 설명과 템플릿을 확인한 뒤 이미지를 생성하세요.</p><p>4. 미리보기에서 수정할 영역을 선택하고 원하는 변경을 입력하세요.</p><p>5. PPTX 또는 PDF로 내보내세요. 편집형 PPTX는 OCR 설정이 필요합니다.</p>
    <p>파일은 로컬 작업공간에 저장됩니다. AI 작업 시 관련 내용과 이미지가 설정한 모델 서비스로 전송됩니다.</p>
  </div>
</Modal>;
