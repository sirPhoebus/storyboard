import { useEffect, useState } from 'react'
import Canvas from './components/Canvas'
import Sidebar from './components/Sidebar'
import { API_BASE_URL } from './config'


/* ... imports */
function App() {
  const [chapters, setChapters] = useState<any[]>([]);
  const [currentChapterId, setCurrentChapterId] = useState<string | null>(null);
  const [pages, setPages] = useState<any[]>([]);
  const [currentPageId, setCurrentPageId] = useState<string | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  // Fetch Chapters
  const fetchChapters = () => {
    fetch(`${API_BASE_URL}/api/chapters?storyboardId=default-storyboard`)

      .then(res => res.json())
      .then(data => {
        setChapters(data);
        if (data.length > 0 && !currentChapterId) {
          setCurrentChapterId(data[0].id);
        }
      });
  };

  const fetchPages = () => {
    // If no chapter selected, maybe clear pages or fetch all?
    // User wants "load pages accordingly".
    // If we have chapters, we should fetch pages for current chapter.
    // If no chapters exist (migration?), currentChapterId might be null.
    // But we seeded default chapter.

    let url = `${API_BASE_URL}/api/pages`;

    if (currentChapterId) {
      url += `?chapterId=${currentChapterId}`;
    }

    fetch(url)
      .then(res => res.json())
      .then(data => {
        setPages(data);
        if (data.length > 0) {
          // Only change page if current page isn't in the list?
          if (!currentPageId || !data.find((p: any) => p.id === currentPageId)) {
            setCurrentPageId(data[0].id);
          }
        } else {
          setCurrentPageId(null);
        }
      });
  };

  useEffect(() => {
    fetchChapters();
  }, []);

  useEffect(() => {
    if (currentChapterId) {
      fetchPages();
    }
  }, [currentChapterId]);

  const handleAddChapter = () => {
    fetch(`${API_BASE_URL}/api/chapters`, {

      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: `Chapter ${chapters.length + 1}`, storyboardId: 'default-storyboard' })
    })
      .then(res => res.json())
      .then(newChapter => {
        setChapters([...chapters, newChapter]);
        setCurrentChapterId(newChapter.id);
      });
  }

  const handleDeleteChapter = (chapterId: string) => {
    if (!window.confirm('Delete chapter and all its pages?')) return;
    fetch(`${API_BASE_URL}/api/chapters/${chapterId}`, {

      method: 'DELETE'
    })
      .then(res => {
        if (!res.ok) throw new Error('Failed to delete');
        return res.json();
      })
      .then(() => {
        const newChapters = chapters.filter(c => c.id !== chapterId);
        setChapters(newChapters);
        if (currentChapterId === chapterId) {
          setCurrentChapterId(newChapters.length > 0 ? newChapters[0].id : null);
        }
      })
      .catch(err => console.error(err));
  };



  const handleAddPage = () => {
    fetch(`${API_BASE_URL}/api/pages`, {

      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: `Page ${pages.length + 1}`,
        storyboardId: 'default-storyboard',
        chapterId: currentChapterId
      })
    })
      .then(res => res.json())
      .then(newPage => {
        setPages([...pages, newPage]);
        setCurrentPageId(newPage.id);
      });
  };

  const handleRenamePage = (id: string, newTitle: string) => {
    fetch(`${API_BASE_URL}/api/pages/${id}`, {

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
        chapters={chapters}
        currentChapterId={currentChapterId}
        onSelectChapter={setCurrentChapterId}
        onAddChapter={handleAddChapter}
        onDeleteChapter={handleDeleteChapter}
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
