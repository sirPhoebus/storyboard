import { useState } from 'react';
import { Plus, X, Edit2, Check, HelpCircle, MessageCircle } from 'lucide-react';
import type { Project } from '../types';

interface ProjectTabsProps {
    projects: Project[];
    currentProjectId: string | null;
    onSelectProject: (id: string) => void;
    onCreateProject: () => void;
    onRenameProject: (id: string, name: string) => void;
    onDeleteProject: (id: string) => void;
    onOpenHelp: () => void;
    onOpenChat: () => void;
    connectedUsers: number;
    username: string;
}

export default function ProjectTabs({
    projects,
    currentProjectId,
    onSelectProject,
    onCreateProject,
    onRenameProject,
    onDeleteProject,
    onOpenHelp,
    onOpenChat,
    connectedUsers,
    username
}: ProjectTabsProps) {
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');

    const startEdit = (project: Project) => {
        setEditingId(project.id);
        setEditName(project.name);
    };

    const saveEdit = (id: string) => {
        if (editName.trim()) {
            onRenameProject(id, editName.trim());
        }
        setEditingId(null);
    };

    const cancelEdit = () => {
        setEditingId(null);
        setEditName('');
    };

    const handleDelete = (id: string, name: string) => {
        if (projects.length <= 1) {
            alert('Cannot delete the last project');
            return;
        }
        if (confirm(`Are you sure you want to delete "${name}"? This will permanently delete all chapters, pages, and assets in this project.`)) {
            onDeleteProject(id);
        }
    };

    return (
        <div className="project-tabs-container">
            <div className="project-tabs">
                {projects.map(project => (
                    <div
                        key={project.id}
                        className={`project-tab ${currentProjectId === project.id ? 'active' : ''}`}
                    >
                        {editingId === project.id ? (
                            <div className="project-tab-edit">
                                <input
                                    type="text"
                                    value={editName}
                                    onChange={e => setEditName(e.target.value)}
                                    onKeyDown={e => {
                                        if (e.key === 'Enter') saveEdit(project.id);
                                        if (e.key === 'Escape') cancelEdit();
                                    }}
                                    autoFocus
                                    onClick={e => e.stopPropagation()}
                                />
                                <button
                                    className="icon-btn success"
                                    onClick={e => { e.stopPropagation(); saveEdit(project.id); }}
                                    title="Save"
                                >
                                    <Check size={14} />
                                </button>
                                <button
                                    className="icon-btn"
                                    onClick={e => { e.stopPropagation(); cancelEdit(); }}
                                    title="Cancel"
                                >
                                    <X size={14} />
                                </button>
                            </div>
                        ) : (
                            <>
                                <span
                                    className="project-tab-name"
                                    onClick={() => onSelectProject(project.id)}
                                >
                                    {project.name}
                                </span>
                                <div className="project-tab-actions">
                                    <button
                                        className="icon-btn"
                                        onClick={e => { e.stopPropagation(); startEdit(project); }}
                                        title="Rename Project"
                                    >
                                        <Edit2 size={14} />
                                    </button>
                                    <button
                                        className="icon-btn danger"
                                        onClick={e => { e.stopPropagation(); handleDelete(project.id, project.name); }}
                                        title="Delete Project"
                                        disabled={projects.length <= 1}
                                    >
                                        <X size={14} />
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                ))}

                <button
                    className="project-tab-add"
                    onClick={onCreateProject}
                    title="Create New Project"
                >
                    <Plus size={16} />
                    <span>New Project</span>
                </button>
            </div>

            <div style={{ marginLeft: 'auto', marginRight: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: '13px' }}>{username}</span>
                <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '13px' }}>({connectedUsers} users)</span>
                <button className="icon-btn" onClick={onOpenChat} title="Chatroom">
                    <MessageCircle size={18} />
                    <span style={{ marginLeft: '6px', fontSize: '12px' }}>Chat</span>
                </button>
                <button
                    className="icon-btn"
                    onClick={onOpenHelp}
                    title="Help & Manual"
                    style={{ color: 'rgba(255,255,255,0.7)' }}
                >
                    <HelpCircle size={20} />
                </button>
            </div>
        </div>
    );
}
