import { focusRequests } from "./focus-requests";

// The app's asks for its panels to move focus into themselves, which its command center item asks
// and its panels take.
export const requests = focusRequests();
