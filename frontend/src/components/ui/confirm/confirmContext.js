import { createContext, useContext } from 'react';

export const ConfirmContext = createContext(() => Promise.resolve(false));

// const confirm = useConfirm();
// if (await confirm({ title, description, confirmLabel, tone: 'danger' })) { ... }
export const useConfirm = () => useContext(ConfirmContext);
