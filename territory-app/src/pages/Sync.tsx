import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Box } from '@mui/material';
import { useAtomValue } from 'jotai';
import { IconDelete, IconInfo, IconSync } from '@icons/index';
import IconButton from '@components/icon_button';
import InfoTip from '@components/info_tip';
import Typography from '@components/typography';
import {
  CardSection,
  CardSectionContent,
  CardSectionHeader,
} from '@features/congregation/settings/shared_styles';
import { invoke, listen, nearby } from '../native';
import { t } from '../i18n';
import { linkOf, linksState, peopleState } from '../profiles';
import useNearby, { Peer, unsynced } from './useNearby';
import { play } from '../haptics';
import {
  MeetDialog,
  PairMethod,
  QrPairDialog,
  QrSendDialog,
  receive,
} from './sync/dialogs';
import { confirm } from './confirm';
import Decisions from './sync/Decisions';
import History from './sync/History';
import { ago, CARD_PREFIX, notify, ONE_SIDED_REASON, time } from './sync/text';
import { IconBluetooth, IconQr, IconTap } from './sync/icons';
import {
  Actions,
  MethodState,
  PairOptions,
  PhoneRow,
  Pulse,
} from './sync/parts';

const Sync = () => {
  const READY: MethodState = { text: t('sync.ready'), color: 'green' };
  const [params, setParams] = useSearchParams();
  const { peers, status, name, removed, refreshPeers, android } = useNearby();
  const [pairing, setPairing] = useState<PairMethod | null>(null);
  const [qrPairOpen, setQrPairOpen] = useState(false);
  // a pairing code scanned while the QR pairing dialog is open, to confirm there
  const [card, setCard] = useState<string | null>(null);
  const pairOpen = useRef(false);
  pairOpen.current = qrPairOpen;
  // a paired device that no longer knows this one
  const [repair, setRepair] = useState<string | null>(null);
  const [sendTo, setSendTo] = useState<Peer | null>(null);
  const links = useAtomValue(linksState);
  const people = useAtomValue(peopleState);
  // only when the device goes by another name than the publisher
  const publisherOf = (peer: Peer) => {
    const person = linkOf(peer.id, links, people).person;
    return person && person.name !== peer.name ? person.name : undefined;
  };

  const permissions = status.permissions;
  const pending = unsynced(peers);
  const lastSync = Math.max(0, ...peers.map((peer) => peer.last_sync ?? 0));
  const syncing = status.exchanges?.find(
    (exchange) => exchange.mode === 0 && exchange.state === 'exchanging'
  );

  useEffect(() => {
    const stops = [
      listen<{ text: string }>('qr', ({ text }) => {
        if (text.startsWith(CARD_PREFIX) && pairOpen.current) setCard(text);
        else receive(text).then(refreshPeers);
      }),
      listen<{ text: string }>('file', ({ text }) =>
        receive(text).then(refreshPeers)
      ),
    ];
    // asked once listening, or the file can come before the listener
    Promise.all(stops).then(() => nearby('takeFile'));
    return () => stops.forEach((stop) => stop.then((unlisten) => unlisten()));
  }, [refreshPeers]);

  const oneSided = status.exchanges?.find(
    (exchange) =>
      exchange.state === 'failed' && exchange.reason === ONE_SIDED_REASON
  )?.peer;
  useEffect(() => {
    if (oneSided) setRepair(oneSided);
  }, [oneSided]);
  const synced = status.lastDone?.peer;
  useEffect(() => {
    if (synced) setRepair((current) => (current === synced ? null : current));
  }, [synced]);
  const repairPeer = peers.find((peer) => peer.id === repair);

  // links from notifications, the launcher shortcuts and the settings card
  useEffect(() => {
    if (params.get('now')) nearby('syncNow');
    const pair = params.get('pair');
    if (pair === 'nearby' || pair === 'tap') setPairing(pair);
    if (params.size) setParams({}, { replace: true });
  }, [params, setParams]);

  const bluetooth: MethodState | undefined = !android
    ? undefined
    : !permissions?.bluetooth
      ? { text: t('sync.needsPermission'), color: 'orange' }
      : permissions.bluetoothOn === false
        ? { text: t('sync.bluetoothOff'), color: 'orange' }
        : READY;
  const bluetoothReady = bluetooth === READY;

  const camera: MethodState =
    !android || permissions?.camera
      ? READY
      : { text: t('sync.needsCamera'), color: 'orange' };

  const fixBluetooth = () =>
    nearby(permissions?.bluetooth ? 'bluetoothOn' : 'permissions');
  const fixBluetoothLabel = permissions?.bluetooth
    ? t('common.turnOnBluetooth')
    : t('common.allowBluetooth');

  const hero = () => {
    if (peers.length === 0) {
      return {
        title: t('settings.noPhones'),
        text: t('sync.heroNone'),
      };
    }
    if (syncing) {
      return {
        title: t('sync.syncing'),
        text: t('sync.syncingText'),
      };
    }
    const last = lastSync ? ago(lastSync) : t('time.neverSynced');
    if (pending > 0) {
      return {
        title: t('sync.toSend', { count: pending }),
        text: t('sync.pendingText', { last }),
      };
    }
    return { title: t('sync.allSynced'), text: last };
  };

  const removePeer = async (peer: Peer) => {
    const name = peer.name;
    const ok = await confirm({
      title: name
        ? t('sync.removeTitle', { name })
        : t('sync.removeTitleUnnamed'),
      description: t('sync.removeText'),
      action: t('sync.remove'),
    });
    if (!ok) return;
    try {
      await invoke('remove_peer', { id: peer.id });
      play('remove');
      notify(
        t('sync.removed'),
        name ? t('sync.removedText', { name }) : t('sync.removedTextUnnamed')
      );
    } catch (error) {
      notify(t('common.somethingWrong'), String(error), 'error');
    }
    refreshPeers();
  };

  const syncNow = () => {
    play('start');
    nearby('syncNow');
  };

  const nameOf = (id?: string | null) =>
    peers.find((peer) => peer.id === id)?.name || t('common.aPairedPhone');

  const { title, text } = hero();

  return (
    <>
      {removed && (
        <InfoTip
          isBig={false}
          color="blue"
          icon={<IconInfo />}
          text={t('sync.removedBanner')}
        />
      )}
      {repairPeer && (
        <CardSection>
          <CardSectionHeader
            title={t('sync.repairTitle')}
            description={t('sync.repairText', {
              name: repairPeer.name || t('common.theOtherPhone'),
            })}
          />
          <Actions
            actions={[
              { label: t('sync.later'), onClick: () => setRepair(null) },
              {
                label: t('sync.pairAgain'),
                kind: 'main',
                onClick: () => {
                  setRepair(null);
                  setPairing('nearby');
                },
              },
            ]}
          />
        </CardSection>
      )}
      <CardSection>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <Pulse
            icon={<IconSync color="var(--accent-main)" />}
            active={status.running || !!syncing}
            size={56}
          />
          <CardSectionHeader title={title} description={text} />
        </Box>
        {status.running && status.until && !syncing && (
          <Typography className="label-small-regular" color="var(--grey-400)">
            {t('sync.looking', { time: time(new Date(status.until)) })}
          </Typography>
        )}
        {/* without a paired device, the pairing card below has the action */}
        {android && peers.length > 0 && (
          <Actions
            actions={[
              {
                label: bluetoothReady ? t('common.syncNow') : fixBluetoothLabel,
                kind: 'main',
                disabled: bluetoothReady && !!syncing,
                onClick: () => (bluetoothReady ? syncNow() : fixBluetooth()),
              },
              // without Bluetooth, changes also come in as a loop of QR codes
              {
                label: t('sync.scan'),
                onClick: () => nearby('scanQr'),
              },
            ]}
          />
        )}
      </CardSection>

      {peers.length > 0 && (
        <CardSection>
          <CardSectionHeader
            title={t('sync.paired')}
            description={t('sync.pairedText')}
          />
          <CardSectionContent spacing="4px" divider={undefined}>
            {peers.map((peer) => (
              <PhoneRow
                key={peer.id}
                id={peer.id}
                name={peer.name || t('common.unnamedPhone')}
                detail={[
                  publisherOf(peer) &&
                    t('sync.publisher', { name: publisherOf(peer) }),
                  peer.introduced_by &&
                    t('sync.joinedThrough', {
                      name: nameOf(peer.introduced_by),
                    }),
                  ago(peer.last_sync),
                  peer.last_sync &&
                    peer.pending > 0 &&
                    t('sync.toSend', { count: peer.pending }),
                ]
                  .filter(Boolean)
                  .join(' · ')}
                trailing={
                  <>
                    <IconButton
                      aria-label={t('sync.sendQr', {
                        name: peer.name || t('common.unnamedPhone'),
                      })}
                      onClick={() => setSendTo(peer)}
                    >
                      <IconQr color="var(--accent-main)" />
                    </IconButton>
                    <IconButton
                      color="error"
                      edge="end"
                      aria-label={t('sync.removeLabel', {
                        name: peer.name || t('common.unnamedPhone'),
                      })}
                      onClick={() => removePeer(peer)}
                    >
                      <IconDelete color="var(--red-main)" />
                    </IconButton>
                  </>
                }
              />
            ))}
          </CardSectionContent>
        </CardSection>
      )}

      <Decisions />

      <CardSection>
        <CardSectionHeader
          title={t('common.pairPhone')}
          description={t('sync.pairText')}
        />
        <CardSectionContent>
          <PairOptions
            icon={<IconBluetooth />}
            title={t('sync.nearby')}
            description={t('sync.nearbyText')}
            state={bluetoothReady ? undefined : bluetooth}
            action={
              bluetoothReady
                ? {
                    label: t('common.pair'),
                    onClick: () => setPairing('nearby'),
                  }
                : {
                    label: fixBluetoothLabel,
                    disabled: !android,
                    onClick: fixBluetooth,
                  }
            }
            othersText={t('sync.otherWays')}
            others={[
              ...(permissions?.nfc
                ? [
                    {
                      icon: <IconTap />,
                      label: t('sync.tap'),
                      onClick: () =>
                        permissions.nfcOn
                          ? setPairing('tap')
                          : nearby('nfcSettings'),
                    },
                  ]
                : []),
              {
                icon: <IconQr />,
                label: t('sync.qr'),
                onClick: () =>
                  camera === READY
                    ? setQrPairOpen(true)
                    : nearby('permissions', { which: 'camera' }),
              },
            ]}
          />
        </CardSectionContent>
      </CardSection>

      <History />

      <MeetDialog
        open={!!pairing}
        method={pairing ?? 'nearby'}
        onClose={() => setPairing(null)}
        status={status}
        myName={name}
        onNamed={refreshPeers}
      />
      <QrPairDialog
        open={qrPairOpen}
        onClose={() => {
          setQrPairOpen(false);
          setCard(null);
        }}
        android={android}
        card={card}
        onCardDone={() => {
          setCard(null);
          refreshPeers();
        }}
      />
      <QrSendDialog peer={sendTo} onClose={() => setSendTo(null)} />
    </>
  );
};

export default Sync;
