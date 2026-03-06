import { useEffect, useState, useCallback } from 'react'
import Canvas from './components/Canvas'
import Sidebar from './components/Sidebar'
import ProjectTabs from './components/ProjectTabs'
import { API_BASE_URL } from './config'
import type { Chapter, Page } from './types'
import { useSocket } from './hooks/useSocket'
import { useProjects } from './hooks/useProjects'
import HelpManual from './components/HelpManual'
import BatchPage from './components/BatchPage'
import ChatRoomModal from './components/ChatRoomModal'



/* ... imports */
function App() {
  const socket = useSocket();
  const { projects, currentProjectId, setCurrentProjectId, createProject, renameProject, deleteProject } = useProjects(socket);

  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [currentChapterId, setCurrentChapterId] = useState<string | null>(null);
  const [allPages, setAllPages] = useState<Page[]>([]);
  const [currentPageId, setCurrentPageId] = useState<string | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(260);
  const [connectedUsers, setConnectedUsers] = useState(1);
  const [isManualOpen, setIsManualOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [view, setView] = useState<'canvas' | 'batch'>('canvas');
  const [currentStoryboardId, setCurrentStoryboardId] = useState<string | null>(null);
  const [username, setUsername] = useState<string>(() => localStorage.getItem('chat_username') || '');

  const pages = allPages.filter(p => p.chapter_id === currentChapterId);

  useEffect(() => {
    if (!username) {
      if (sessionStorage.getItem('chat_username_prompted') === '1') {
        return;
      }
      sessionStorage.setItem('chat_username_prompted', '1');
      const entered = window.prompt('Enter your display name:', 'Guest');
      const finalName = (entered && entered.trim()) ? entered.trim() : `Guest-${Math.floor(Math.random() * 10000)}`;
      setUsername(finalName);
      localStorage.setItem('chat_username', finalName);
    }
  }, [username]);

  // Fetch Storyboard when Project Changes
  useEffect(() => {
    if (currentProjectId) {
      // Reset state to avoid ghosting
      setChapters([]);
      setAllPages([]);
      setCurrentChapterId(null);
      setCurrentPageId(null);
      setCurrentStoryboardId(null);

      fetch(`${API_BASE_URL}/api/projects/${currentProjectId}/storyboard`)
        .then(res => res.json())
        .then(data => {
          if (data && data.id) {
            setCurrentStoryboardId(data.id);
          }
        })
        .catch(err => console.error("Failed to load storyboard", err));
    }
  }, [currentProjectId]);

  // Fetch Chapters (filtered by project via storyboardId)
  const fetchChapters = useCallback(() => {
    if (!currentStoryboardId) return;

    fetch(`${API_BASE_URL}/api/chapters?storyboardId=${currentStoryboardId}`)
      .then(res => res.json())
      .then(data => {
        if (!Array.isArray(data)) {
          console.error('API Error: Expected array for chapters, got:', data);
          return;
        }
        setChapters(data);
        if (data.length > 0 && !currentChapterId) {
          setCurrentChapterId(data[0].id);
        }
      });
  }, [currentChapterId, currentStoryboardId]);

  const fetchPages = useCallback(() => {
    if (!currentStoryboardId) return;

    const url = `${API_BASE_URL}/api/pages?storyboardId=${currentStoryboardId}`;

    fetch(url)
      .then(res => res.json())
      .then(data => {
        if (!Array.isArray(data)) {
          console.error('API Error: Expected array for pages, got:', data);
          return;
        }
        setAllPages(data);
        if (data.length > 0) {
          const firstPageInChapter = data.find((p: Page) => p.chapter_id === currentChapterId);
          if (!currentPageId || !data.find((p: Page) => p.id === currentPageId)) {
            setCurrentPageId(firstPageInChapter ? firstPageInChapter.id : data[0].id);
          }
        } else {
          setCurrentPageId(null);
        }
      });
  }, [currentChapterId, currentPageId, currentStoryboardId]);

  useEffect(() => {
    fetchChapters();
    fetchPages(); // Fetch all initially
  }, [fetchChapters, fetchPages]);

  useEffect(() => {
    if (socket) {
      socket.on('user_count', (count: number) => {
        setConnectedUsers(count);
      });

      socket.on('chapter:add', (chapter: Chapter) => {
        setChapters(prev => [...prev].some(c => c.id === chapter.id) ? prev : [...prev, chapter]);
      });

      socket.on('chapter:update', (data: { id: string, title: string }) => {
        setChapters(prev => prev.map(c => c.id === data.id ? { ...c, title: data.title } : c));
      });

      socket.on('chapter:delete', (data: { id: string }) => {
        setChapters(prev => prev.filter(c => c.id !== data.id));
        setAllPages(prev => prev.filter(p => p.chapter_id !== data.id));
        if (currentChapterId === data.id) {
          setCurrentChapterId(null);
        }
      });

      socket.on('page:add', (page: Page) => {
        setAllPages(prev => [...prev].some(p => p.id === page.id) ? prev : [...prev, page]);
      });

      socket.on('page:update', (page: Page) => {
        setAllPages(prev => prev.map(p => p.id === page.id ? { ...p, ...page } : p));
      });

      socket.on('page:delete', (data: { id: string }) => {
        setAllPages(prev => prev.filter(p => p.id !== data.id));
        if (currentPageId === data.id) {
          setCurrentPageId(null);
        }
      });

      socket.on('pages:reorder', (data: { order: string[] }) => {
        setAllPages(prev => {
          const pageMap = new Map(prev.map(p => [p.id, p]));
          const newOrder = data.order.map(id => pageMap.get(id)).filter(Boolean) as Page[];
          return newOrder;
        });
      });

      socket.on('chat:message', () => {
        setIsChatOpen((open) => (open ? open : true));
      });

      return () => {
        socket.off('user_count');
        socket.off('chapter:add');
        socket.off('chapter:update');
        socket.off('chapter:delete');
        socket.off('page:add');
        socket.off('page:update');
        socket.off('page:delete');
        socket.off('pages:reorder');
        socket.off('chat:message');
      };
    }
  }, [socket, currentChapterId, currentPageId]);

  const handlePageSelection = useCallback((pageId: string) => {
    // Find the page to discover its chapter
    const page = allPages.find(p => p.id === pageId);
    if (page) {
      if (page.chapter_id !== currentChapterId) {
        setCurrentChapterId(page.chapter_id);
      }
      setCurrentPageId(pageId);
      setView('canvas');
    }
  }, [allPages, currentChapterId]);

  useEffect(() => {
    if (currentChapterId && allPages.length > 0) {
      // Find the first page of the selected chapter
      const firstPageInChapter = allPages.find((p: Page) => p.chapter_id === currentChapterId);

      // Check if the current page is already in the selected chapter
      const isCurrentPageInChapter = allPages.find((p: Page) => p.id === currentPageId && p.chapter_id === currentChapterId);

      // Only switch if we are NOT already on a page belonging to this chapter
      if (!isCurrentPageInChapter) {
        if (firstPageInChapter) {
          setTimeout(() => handlePageSelection(firstPageInChapter.id), 0);
        } else {
          setTimeout(() => setCurrentPageId(null), 0);
        }
      }
    }
  }, [currentChapterId, allPages, currentPageId, handlePageSelection]);


  const handleAddChapter = () => {
    fetch(`${API_BASE_URL}/api/chapters`, {

      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: `Chapter ${chapters.length + 1}`, storyboardId: currentStoryboardId })
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
        storyboardId: currentStoryboardId,
        chapterId: currentChapterId
      })
    })
      .then(res => res.json())
      .then(newPage => {
        setAllPages([...allPages, newPage]);
        setCurrentPageId(newPage.id);
        setView('canvas');
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

  /*
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
  */

  const handleCreateProject = () => {
    const name = prompt('Enter project name:');
    if (name) {
      createProject(name.trim() || 'New Project');
    }
  };

  if (!username) {
    return <div style={{ width: '100vw', height: '100vh', display: 'grid', placeItems: 'center', color: '#bbb' }}>Loading workspace...</div>;
  }

  return (
    <div className="App" style={{ display: 'flex', flexDirection: 'column', width: '100vw', height: '100vh', overflow: 'hidden' }}>
      <ProjectTabs
        projects={projects}
        currentProjectId={currentProjectId}
        onSelectProject={setCurrentProjectId}
        onCreateProject={handleCreateProject}
        onRenameProject={renameProject}
        onDeleteProject={deleteProject}
        onOpenHelp={() => setIsManualOpen(true)}
        onOpenChat={() => setIsChatOpen(true)}
        connectedUsers={connectedUsers}
        username={username}
      />

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <Sidebar
          chapters={chapters}
          currentChapterId={currentChapterId}
          onSelectChapter={setCurrentChapterId}
          onAddChapter={handleAddChapter}
          onDeleteChapter={handleDeleteChapter}
          onRenameChapter={handleRenameChapter}
          pages={pages}
          currentPageId={currentPageId}
          onSelectPage={handlePageSelection}
          onAddPage={handleAddPage}
          onRenamePage={handleRenamePage}
          isCollapsed={isSidebarCollapsed}
          onToggle={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          onRefresh={fetchPages}
          width={sidebarWidth}
          onWidthChange={setSidebarWidth}
          connectedUsers={connectedUsers}
          projects={projects}
        />

        {view === 'canvas' ? (
          <Canvas
            pageId={currentPageId}
            isSidebarCollapsed={isSidebarCollapsed}
            sidebarWidth={sidebarWidth}
            chapters={chapters}
            allPages={allPages}
            onSelectPage={handlePageSelection}
            onOpenBatchManagement={() => setView('batch')}
            socket={socket}
            currentProjectId={currentProjectId}
          />
        ) : (
          <BatchPage
            socket={socket}
          />
        )}
      </div>





      <HelpManual isOpen={isManualOpen} onClose={() => setIsManualOpen(false)} />
      <ChatRoomModal
        isOpen={isChatOpen}
        onClose={() => setIsChatOpen(false)}
        username={username}
        socket={socket}
      />

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
