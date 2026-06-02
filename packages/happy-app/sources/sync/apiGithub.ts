import { AuthCredentials } from '@/auth/tokenStorage';
import { HappyError } from '@/utils/errors';
import { apiFetch } from './apiFetch';
import { getServerUrl } from './serverConfig';

export interface GitHubOAuthParams {
    url: string;
}

export interface GitHubProfile {
    id: number;
    login: string;
    name: string;
    avatar_url: string;
    email?: string;
}

export interface AccountProfile {
    id: string;
    timestamp: number;
    github: GitHubProfile | null;
}

/**
 * Get GitHub OAuth parameters from the server
 */
export async function getGitHubOAuthParams(credentials: AuthCredentials, callback?: string): Promise<GitHubOAuthParams> {
    const API_ENDPOINT = getServerUrl();

    // OAuth configuration errors (400) are permanent and should fail immediately.
    // apiFetch does not retry 4xx responses, so the 400 below is surfaced at once
    // (only network/5xx failures are retried).
    const url = new URL(`${API_ENDPOINT}/v1/connect/github/params`);
    if (callback) {
        url.searchParams.set('callback', callback);
    }
    const response = await apiFetch(url.toString(), {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${credentials.token}`,
            'Content-Type': 'application/json'
        }
    });

    if (!response.ok) {
        if (response.status === 400) {
            const error = await response.json();
            throw new HappyError(error.error || 'GitHub OAuth not configured', false);
        }
        throw new HappyError(`Failed to get GitHub OAuth params: ${response.status}`, false);
    }

    const data = await response.json() as GitHubOAuthParams;
    return data;
}

/**
 * Get account profile including GitHub connection status
 */
export async function getAccountProfile(credentials: AuthCredentials): Promise<AccountProfile> {
    const API_ENDPOINT = getServerUrl();
    
    const response = await apiFetch(`${API_ENDPOINT}/v1/account/profile`, {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${credentials.token}`,
            'Content-Type': 'application/json'
        }
    });

    if (!response.ok) {
        throw new Error(`Failed to get account profile: ${response.status}`);
    }

    const data = await response.json() as AccountProfile;
    return data;
}

/**
 * Disconnect GitHub account from the user's profile
 */
export async function disconnectGitHub(credentials: AuthCredentials): Promise<void> {
    const API_ENDPOINT = getServerUrl();
    
    const response = await apiFetch(`${API_ENDPOINT}/v1/connect/github`, {
        method: 'DELETE',
        headers: {
            'Authorization': `Bearer ${credentials.token}`
        }
    });

    if (!response.ok) {
        if (response.status === 404) {
            const error = await response.json();
            throw new Error(error.error || 'GitHub account not connected');
        }
        throw new Error(`Failed to disconnect GitHub: ${response.status}`);
    }

    const data = await response.json() as { success: true };
    if (!data.success) {
        throw new Error('Failed to disconnect GitHub account');
    }
}