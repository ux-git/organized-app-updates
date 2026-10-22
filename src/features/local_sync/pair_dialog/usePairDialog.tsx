import { useEffect, useState } from 'react';
import { useAtomValue } from 'jotai';
import QRCode from 'qrcode';
import { NearbyPairMethod } from '@definition/local_sync';
import {
  nearbyAvailableState,
  nearbyInviteState,
  nearbyStatusState,
} from '@states/local_sync';
import { nearby } from '@services/local_sync/nearby';

const usePairDialog = (onClose: VoidFunction) => {
  const available = useAtomValue(nearbyAvailableState);
  const status = useAtomValue(nearbyStatusState);
  const invite = useAtomValue(nearbyInviteState);

  const [method, setMethod] = useState<NearbyPairMethod>();
  const [code, setCode] = useState('');
  const [qrImage, setQrImage] = useState('');

  const handleChoose = (chosen: NearbyPairMethod) => {
    setMethod(chosen);

    if (chosen === 'nearby') nearby('pair');
    if (chosen === 'invite') nearby('invite');
    if (chosen === 'tap') nearby('tap');
  };

  const handleCodeChange = (value: string) => {
    setCode(value.replace(/\D/g, '').slice(0, 6));
  };

  const handleJoin = () => nearby('join', { code });

  const handleBack = () => {
    nearby('cancel');
    setMethod(undefined);
    setCode('');
  };

  useEffect(() => {
    if (!invite?.text) {
      setQrImage('');
      return;
    }

    QRCode.toDataURL(invite.text, { margin: 1, width: 240 })
      .then(setQrImage)
      .catch(() => setQrImage(''));
  }, [invite]);

  // pairing is over, one way or the other
  useEffect(() => {
    if (status.state === 'done') onClose();
  }, [status, onClose]);

  return {
    available,
    status,
    invite,
    method,
    code,
    qrImage,
    canJoin: code.length === 6,
    handleChoose,
    handleCodeChange,
    handleJoin,
    handleBack,
  };
};

export default usePairDialog;
