import type { AppStateShape } from "@/lib/state";

declare global {
    interface WindowEventMap {
        stateChange: CustomEvent<AppStateShape>;
    }
}

export {};
