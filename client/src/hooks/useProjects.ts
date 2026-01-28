import { useState, useEffect, useCallback } from 'react';
import { Socket } from 'socket.io-client';
import { API_BASE_URL } from '../config';
import type { Project } from '../types';

export const useProjects = (socket: Socket | null) => {
    const [projects, setProjects] = useState<Project[]>([]);
    const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    const fetchProjects = useCallback(() => {
        setIsLoading(true);
        fetch(`${API_BASE_URL}/api/projects`)
            .then(res => res.json())
            .then((data: Project[]) => {
                setProjects(data);
                if (data.length > 0 && !currentProjectId) {
                    setCurrentProjectId(data[0].id);
                }
                setIsLoading(false);
            })
            .catch(err => {
                console.error('Failed to fetch projects:', err);
                setIsLoading(false);
            });
    }, [currentProjectId]);

    useEffect(() => {
        fetchProjects();
    }, [fetchProjects]);

    useEffect(() => {
        if (!socket) return;

        socket.on('project:add', (project: Project) => {
            setProjects(prev => [...prev, project]);
        });

        socket.on('project:update', (project: Project) => {
            setProjects(prev => prev.map(p => p.id === project.id ? project : p));
        });

        socket.on('project:delete', (data: { id: string }) => {
            setProjects(prev => {
                const filtered = prev.filter(p => p.id !== data.id);
                // If current project was deleted, switch to first available
                if (currentProjectId === data.id && filtered.length > 0) {
                    setCurrentProjectId(filtered[0].id);
                }
                return filtered;
            });
        });

        return () => {
            socket.off('project:add');
            socket.off('project:update');
            socket.off('project:delete');
        };
    }, [socket, currentProjectId]);

    const createProject = useCallback((name: string) => {
        return fetch(`${API_BASE_URL}/api/projects`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        })
            .then(res => res.json())
            .then((newProject: Project) => {
                setCurrentProjectId(newProject.id);
                return newProject;
            });
    }, []);

    const renameProject = useCallback((id: string, name: string) => {
        return fetch(`${API_BASE_URL}/api/projects/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        }).then(res => res.json());
    }, []);

    const deleteProject = useCallback((id: string) => {
        return fetch(`${API_BASE_URL}/api/projects/${id}`, {
            method: 'DELETE'
        }).then(res => res.json());
    }, []);

    return {
        projects,
        currentProjectId,
        setCurrentProjectId,
        isLoading,
        createProject,
        renameProject,
        deleteProject,
        refetch: fetchProjects
    };
};
