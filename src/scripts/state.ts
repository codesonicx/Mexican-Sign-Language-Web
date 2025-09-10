// src/lib/state.ts
export type Status = "idle" | "loading" | "requestDone" | "error";

export interface DetectionResult {
    detectedLetter: string;   // ej. "A"
    confidenceNum: number;    // 0..1
    handDetected: string;     // "Left" | "Right" | "—"
}

export interface AppStateShape {
    status: Status;
    result?: DetectionResult;
    errorMessage?: string | null;
}

const state: AppStateShape = {
    status: "idle",
    result: undefined,
    errorMessage: null,
};

export const AppState = {
    getState(): AppStateShape {
        return state;
    },
    getStatus(): Status {
        return state.status;
    },
    setStatus(next: Status) {
        if (next === state.status) return;
        state.status = next;
        window.dispatchEvent(new CustomEvent<AppStateShape>("stateChange", { detail: state }));
    },
    setResult(result: DetectionResult | undefined) {
        state.result = result;
        window.dispatchEvent(new CustomEvent<AppStateShape>("stateChange", { detail: state }));
    },
    setError(message: string | null) {
        state.errorMessage = message;
        state.status = "error"; // para que la UI reaccione como error
        window.dispatchEvent(new CustomEvent<AppStateShape>("stateChange", { detail: state }));
    },
    reset() {
        state.status = "idle";
        state.result = undefined;
        state.errorMessage = null;
        window.dispatchEvent(new CustomEvent<AppStateShape>("stateChange", { detail: state }));
    },
};

// (Opcional) debug en consola
if (typeof window !== "undefined") {
    (window as any).AppState = AppState;
}
