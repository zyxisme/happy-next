// packages/happy-app/sources/realtime/voiceModalRegistry.ts

// Tracks the single voice-initiated modal that is currently visible
// (SessionPickerModal or ActionConfirmationModal). The voice tool
// `cancelPendingAction` and the "open new picker / new countdown"
// flows both rely on this to dismiss the existing one cleanly.

export type VoiceModalKind = 'picker' | 'countdown';

export interface RegisteredVoiceModal {
    kind: VoiceModalKind;
    /** Synchronously close the modal as if the user tapped cancel. */
    dismiss: () => void;
}

let current: RegisteredVoiceModal | null = null;

export const ModalRegistry = {
    register(modal: RegisteredVoiceModal): void {
        if (current && current !== modal) current.dismiss();
        current = modal;
    },
    unregister(modal: RegisteredVoiceModal): void {
        if (current === modal) current = null;
    },
    dismissCurrent(): boolean {
        const modal = current;
        if (!modal) return false;
        current = null;
        modal.dismiss();
        return true;
    },
    // Only dismiss if the current modal is a session picker. Used by
    // switchSession/deleteSessionTool to close a stale picker without
    // killing an unrelated in-flight countdown (e.g. sendConfirmation).
    dismissCurrentPicker(): boolean {
        const modal = current;
        if (!modal || modal.kind !== 'picker') return false;
        current = null;
        modal.dismiss();
        return true;
    },
    hasCurrent(): boolean {
        return current !== null;
    },
};
