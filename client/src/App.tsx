import { useEffect, useState } from 'react'
import Canvas from './components/Canvas'
import Sidebar from './components/Sidebar'
import { API_BASE_URL } from './config'
import type { Chapter, Page } from './types'
import { useSocket } from './hooks/useSocket'
import HelpManual from './components/HelpManual'
import { HelpCircle, Download } from 'lucide-react'


/* ... imports */
function App() {
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [currentChapterId, setCurrentChapterId] = useState<string | null>(null);
  const [allPages, setAllPages] = useState<Page[]>([]);
  const [currentPageId, setCurrentPageId] = useState<string | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(260);
  const [connectedUsers, setConnectedUsers] = useState(1);
  const [isManualOpen, setIsManualOpen] = useState(false);
  const socket = useSocket();

  const pages = allPages.filter(p => p.chapter_id === currentChapterId);

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

    // if (currentChapterId) {
    //   url += `?chapterId=${currentChapterId}`;
    // }

    fetch(url)
      .then(res => res.json())
      .then(data => {
        setAllPages(data);
        if (data.length > 0) {
          const firstPageInChapter = data.find((p: any) => p.chapter_id === currentChapterId);
          if (!currentPageId || !data.find((p: any) => p.id === currentPageId)) {
            setCurrentPageId(firstPageInChapter ? firstPageInChapter.id : data[0].id);
          }
        } else {
          setCurrentPageId(null);
        }
      });
  };

  useEffect(() => {
    fetchChapters();
    fetchPages(); // Fetch all initially
  }, []);

  useEffect(() => {
    if (socket) {
      socket.on('user_count', (count: number) => {
        setConnectedUsers(count);
      });
      return () => {
        socket.off('user_count');
      };
    }
  }, [socket]);

  useEffect(() => {
    if (currentChapterId && allPages.length > 0) {
      // Find the first page of the selected chapter
      const firstPageInChapter = allPages.find((p: any) => p.chapter_id === currentChapterId);

      // Check if the current page is already in the selected chapter
      const isCurrentPageInChapter = allPages.find(p => p.id === currentPageId && p.chapter_id === currentChapterId);

      // Only switch if we are NOT already on a page belonging to this chapter
      if (!isCurrentPageInChapter) {
        if (firstPageInChapter) {
          setCurrentPageId(firstPageInChapter.id);
        } else {
          setCurrentPageId(null);
        }
      }
    }
  }, [currentChapterId, allPages, currentPageId]);

  const handlePageSelection = (pageId: string) => {
    // Find the page to discover its chapter
    const page = allPages.find(p => p.id === pageId);
    if (page) {
      if (page.chapter_id !== currentChapterId) {
        setCurrentChapterId(page.chapter_id);
      }
      setCurrentPageId(pageId);
    }
  };

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
        fetchPages(); // Refresh pages to get the auto-created one
      });
  }

  const handleDeleteChapter = (chapterId: string) => {
    // Confirmation handled in UI
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

  const handleRenameChapter = (id: string, newTitle: string) => {
    fetch(`${API_BASE_URL}/api/chapters/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newTitle })
    })
      .then(res => res.json())
      .then(() => {
        setChapters(chapters.map(c => c.id === id ? { ...c, title: newTitle } : c));
      });
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
        setAllPages([...allPages, newPage]);
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
        setAllPages(allPages.map(p => p.id === id ? { ...p, title: newTitle } : p));
      });
  };

  const handleExport = () => {
    const state = {
      chapters,
      pages: allPages,
      exportedAt: new Date().toISOString(),
      version: '1.0'
    };
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `storyboard-export-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="App" style={{ display: 'flex', width: '100vw', height: '100vh', overflow: 'hidden' }}>
      <Sidebar
        chapters={chapters}
        currentChapterId={currentChapterId}
        onSelectChapter={setCurrentChapterId}
        onAddChapter={handleAddChapter}
        onDeleteChapter={handleDeleteChapter}
        onRenameChapter={handleRenameChapter}
        pages={pages}
        currentPageId={currentPageId}
        onSelectPage={setCurrentPageId}
        onAddPage={handleAddPage}
        onRenamePage={handleRenamePage}
        isCollapsed={isSidebarCollapsed}
        onToggle={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        onRefresh={fetchPages}
        width={sidebarWidth}
        onWidthChange={setSidebarWidth}
        connectedUsers={connectedUsers}
      />
      <Canvas
        pageId={currentPageId}
        isSidebarCollapsed={isSidebarCollapsed}
        sidebarWidth={sidebarWidth}
        chapters={chapters}
        allPages={allPages}
        onSelectPage={handlePageSelection}
        socket={socket}
      />

      {/* Floating Action Buttons */}
      <div style={{
        position: 'fixed',
        top: '20px',
        left: isSidebarCollapsed ? '86px' : `${sidebarWidth + 20}px`,
        display: 'flex',
        flexDirection: 'row',
        gap: '12px',
        zIndex: 100,
        transition: 'left 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
      }}>
        <button
          onClick={handleExport}
          style={{
            background: 'rgba(30,30,30,0.8)',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '12px',
            padding: '10px 16px',
            color: 'white',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '14px',
            fontWeight: 500,
            transition: 'all 0.2s',
            boxShadow: '0 4px 15px rgba(0,0,0,0.3)'
          }}
          className="hover-lift"
        >
          <Download size={18} />
          Export
        </button>
        <button
          onClick={() => setIsManualOpen(true)}
          style={{
            background: 'rgba(30,30,30,0.8)',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '12px',
            width: '42px',
            height: '42px',
            color: 'white',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.2s',
            boxShadow: '0 4px 15px rgba(0,0,0,0.3)'
          }}
          className="hover-lift"
        >
          <HelpCircle size={24} />
        </button>
      </div>

      <HelpManual isOpen={isManualOpen} onClose={() => setIsManualOpen(false)} />

      <style>{`
        .hover-lift:hover {
          transform: translateY(-2px);
          background: rgba(52, 152, 219, 0.2) !important;
          border-color: #3498db !important;
        }
      `}</style>
    </div>
  )
}

export default App
