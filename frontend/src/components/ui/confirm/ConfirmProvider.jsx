import { useCallback, useRef, useState } from 'react';
import Button from '../Button';
import Dialog from '../Dialog';
import { ConfirmContext } from './confirmContext';

// Replaces window.confirm with an accessible dialog. The cancel button gets
// focus first, so pressing Enter by accident never confirms a deletion.
function ConfirmProvider({ children }) {
  const [open, setOpen] = useState(false);
  // Kept after closing so the dialog's text stays put during its exit animation
  const [request, setRequest] = useState(null);
  const cancelRef = useRef(null);

  const confirm = useCallback(
    (options) =>
      new Promise((resolve) => {
        setRequest({ ...options, resolve });
        setOpen(true);
      }),
    []
  );

  const settle = (result) => {
    request?.resolve(result);
    setOpen(false);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog
        open={open}
        onClose={() => settle(false)}
        title={request?.title ?? 'Are you sure?'}
        description={request?.description}
        size="sm"
        initialFocusRef={cancelRef}
        footer={
          <>
            <Button ref={cancelRef} variant="secondary" onClick={() => settle(false)}>
              {request?.cancelLabel ?? 'Cancel'}
            </Button>
            <Button variant={request?.tone === 'danger' ? 'danger' : 'primary'} onClick={() => settle(true)}>
              {request?.confirmLabel ?? 'Confirm'}
            </Button>
          </>
        }
      />
    </ConfirmContext.Provider>
  );
}

export default ConfirmProvider;
