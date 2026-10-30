import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Home } from './pages/Home';
import { History } from './pages/History';
import { OutlineEditor } from './pages/OutlineEditor';
import { DetailEditor } from './pages/DetailEditor';
import { TemplateSetupPage } from './pages/TemplateSetupPage';
import { SlidePreview } from './pages/SlidePreview';
import { SettingsPage } from './pages/Settings';
import { useProjectStore } from './store/useProjectStore';
import { useToast } from './components/shared';

function App() {
  const { currentProject, syncProject, error, setError } = useProjectStore();
  const { show, ToastContainer } = useToast();

  // Restore Project Status
  useEffect(() => {
    const savedProjectId = localStorage.getItem('currentProjectId');
    if (savedProjectId && !currentProject) {
      syncProject();
    }
  }, [currentProject, syncProject]);

  // Show global errors
  useEffect(() => {
    if (error) {
      show({ message: error, type: 'error' });
      setError(null);
    }
  }, [error, setError, show]);


  return (
    <>
      <div>

          {(() => {
            const Router = BrowserRouter;
            return (
              <Router>
                <Routes>
                  <Route path="/" element={<Home />} />
                  <Route path="/history" element={<History />} />
                  <Route path="/settings" element={<SettingsPage />} />
                  <Route path="/project/:projectId/outline" element={<OutlineEditor />} />
                  <Route path="/project/:projectId/detail" element={<DetailEditor />} />
                  <Route path="/project/:projectId/template-setup" element={<TemplateSetupPage />} />
                  <Route path="/project/:projectId/preview" element={<SlidePreview />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
                <ToastContainer />
              </Router>
            );
          })()}

      </div>
    </>
  );
}

export default App;
