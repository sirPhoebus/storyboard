import { useEffect, useState } from 'react'
import Canvas from './components/Canvas'
import Sidebar from './components/Sidebar'

function App() {
  const [pages, setPages] = useState<any[]>([]);
  const [currentPageId, setCurrentPageId] = useState<string | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  const fetchPages = () => {
    fetch('http://localhost:5000/api/pages')
      .then(res => res.json())
      .then(data => {
        setPages(data);
        if (data.length > 0 && !currentPageId) {
          setCurrentPageId(data[0].id);
        }
      });
  };

  useEffect(() => {
    fetchPages();
  }, []);

  const handleAddPage = () => {
    fetch('http://localhost:5000/api/pages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: `Page ${pages.length + 1}`, storyboardId: 'default-storyboard' })
    })
      .then(res => res.json())
      .then(newPage => {
        setPages([...pages, newPage]);
        setCurrentPageId(newPage.id);
      });
  };

  const handleRenamePage = (id: string, newTitle: string) => {
    fetch(`http://localhost:5000/api/pages/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newTitle })
    })
      .then(res => res.json())
      .then(() => {
        setPages(pages.map(p => p.id === id ? { ...p, title: newTitle } : p));
      });
  };

  return (
    <div className="App" style={{ display: 'flex', width: '100vw', height: '100vh', overflow: 'hidden' }}>
      <Sidebar
        pages={pages}
        currentPageId={currentPageId}
        onSelectPage={setCurrentPageId}
        onAddPage={handleAddPage}
        onRenamePage={handleRenamePage}
        isCollapsed={isSidebarCollapsed}
        onToggle={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        onRefresh={fetchPages}
      />
      <Canvas
        pageId={currentPageId}
        isSidebarCollapsed={isSidebarCollapsed}
      />
    </div>
  )
}

export default App
