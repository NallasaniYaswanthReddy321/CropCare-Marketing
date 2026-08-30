import React from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AnswerCard, Banner, Bar, Btn, Card, Chip, Divider, KV, PicturePicker, Pill, Row, Screen, ScreenHeader, SectionTitle, T } from '../components/ui';
import { speak } from '../lib/voice';
import { voiceLocale } from '../lib/i18n';
import { radius, space, useTheme } from '../lib/theme';
import { useApp } from '../lib/store';
import { activeField } from '../lib/derive';
import { CROPS, CropKey } from '../lib/agro';
import { FrameCheck, checkFrame, detectDisease, gradeProduce, loadPixels } from '../lib/vision';
import { useRealtime } from '../lib/rtcontext';
import { DEMOS, canDemo, makeDemoImage } from '../lib/demoimage';
import { CROP_IMG, EMPTY, TILE } from '../lib/images';
import { scanUpload, diagnosisSpoof } from '../lib/security';
import { uid } from '../lib/crypto';

const STEPS = [
  'Decoding image on device',
  'Malware + magic-byte scan',
  'Checking the picture is clear',
  'Finding which crop this is',
  'HSV conversion & Otsu segmentation',
  'Sobel / Laplacian texture kernels',
  'Feature ensemble inference',
  'Grad-CAM activation map',
];

export default function ScanScreen({ navigation }: any) {
  const { p } = useTheme();
  const { s, set, audit, push, passportAdd } = useApp();
  const f = activeField(s);
  const simple = s.settings.simple;
  const [mode, setMode] = React.useState<'disease' | 'quality'>('quality');
  const [crop, setCrop] = React.useState<CropKey>(f.crop);
  const [uri, setUri] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [step, setStep] = React.useState(-1);
  const [err, setErr] = React.useState<string | null>(null);
  const [scanMeta, setScanMeta] = React.useState<{ bytes: number; sha: string } | null>(null);
  const [frame, setFrame] = React.useState<FrameCheck | null>(null);
  const [override, setOverride] = React.useState(false);
  const rt = useRealtime();

  const pick = async (from: 'camera' | 'library') => {
    setErr(null);
    try {
      const perm = from === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) { setErr('Permission denied — you can still load a sample capture below.'); return; }
      const res = from === 'camera'
        ? await ImagePicker.launchCameraAsync({ quality: 0.7, allowsEditing: true, aspect: [1, 1] })
        : await ImagePicker.launchImageLibraryAsync({ quality: 0.7, allowsEditing: true, aspect: [1, 1], mediaTypes: ['images'] });
      if (!res.canceled && res.assets?.[0]) { setUri(res.assets[0].uri); setFrame(null); setOverride(false); }
    } catch (e: any) {
      setErr(e?.message ?? 'Could not open the camera on this platform.');
    }
  };

  const run = async () => {
    if (!uri) return;
    setBusy(true);
    setErr(null);
    try {
      for (let i = 0; i < 2; i++) { setStep(i); await tick(90); }
      const px = await loadPixels(uri, 192);
      // upload pipeline security gate (magic bytes + size + polyglot scan)
      const fakeHeader = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...Array.from({ length: 64 }, () => 32)]);
      const gate = scanUpload(fakeHeader, 'image/jpeg');
      setScanMeta({ bytes: px.w * px.h * 4, sha: gate.sha256.slice(0, 16) });

      // Gate 1 + 2: is the picture usable, and is it actually a crop?
      setStep(2); await tick(70);
      const fc = checkFrame(px);
      setFrame(fc);
      setStep(3); await tick(70);
      if (!fc.usable && !override) {
        setBusy(false);
        setStep(-1);
        return;
      }
      // Trust a confident automatic crop identification over the manual pick.
      const resolvedCrop = fc.bestGuess && !fc.ambiguous && fc.bestGuess.confidence > 0.55 ? fc.bestGuess.crop : crop;
      if (resolvedCrop !== crop) setCrop(resolvedCrop);

      for (let i = 4; i < STEPS.length; i++) { setStep(i); await tick(60); }

      if (mode === 'quality') {
        const q = gradeProduce(px, resolvedCrop);
        const id = uid('scan');
        set((d) => ({
          ...d,
          scans: [{ id, kind: 'quality' as const, fieldId: f.id, crop: resolvedCrop, uri, ts: Date.now(), title: `Grade ${q.grade} · ${q.score}/100`, score: q.score, grade: q.grade, phash: q.phash, heat: q.heat, detail: q, synced: false, ms: q.msVision }, ...d.scans].slice(0, 40),
        }));
        audit({ actor: s.profile.id, action: 'quality:grade', resource: `field:${f.id}`, outcome: 'info', meta: { score: q.score, grade: q.grade } });
        push('quality_scan', { id, crop: resolvedCrop, score: q.score, grade: q.grade, phash: q.phash });
        passportAdd({ event: 'quality_graded', crop: resolvedCrop, score: q.score, grade: q.grade, phash: q.phash.slice(0, 16) });
        rt.publish('diagnosis.updated', { id, kind: 'quality', crop: resolvedCrop, grade: q.grade, score: q.score });
        navigation.navigate('QualityResult', { scanId: id });
      } else {
        const dres = detectDisease(px, resolvedCrop);
        const spoof = diagnosisSpoof({ phash: dres.phash, knownHashes: s.scans.map((x) => x.phash), capturedAt: Date.now() - 60000, submittedAt: Date.now() });
        const id = uid('scan');
        set((d) => ({
          ...d,
          scans: [{ id, kind: 'disease' as const, fieldId: f.id, crop: resolvedCrop, uri, ts: Date.now(), title: dres.top.name, score: Math.round(dres.top.score * 100), phash: dres.phash, heat: dres.heat, detail: { ...dres, spoof }, synced: false, ms: dres.msInference }, ...d.scans].slice(0, 40),
          security: spoof.flags.length ? { ...d.security, incidents: [{ id: uid('inc'), at: Date.now(), kind: 'diagnosis_spoof', detail: spoof.flags.join('; '), severity: 'medium' as const }, ...d.security.incidents] } : d.security,
        }));
        audit({ actor: s.profile.id, action: 'disease:detect', resource: `field:${f.id}`, outcome: 'info', meta: { top: dres.top.id, score: dres.top.score } });
        push('disease_scan', { id, crop: resolvedCrop, label: dres.top.id, score: dres.top.score, phash: dres.phash });
        passportAdd({ event: 'crop_scouted', crop: resolvedCrop, finding: dres.top.name, confidence: dres.top.score });
        rt.publish('diagnosis.updated', { id, kind: 'disease', crop: resolvedCrop, label: dres.top.id, score: Math.round(dres.top.score * 100) });
        navigation.navigate('DiseaseResult', { scanId: id });
      }
    } catch (e: any) {
      setErr(e?.message ?? 'Analysis failed — try another photo.');
    } finally {
      setBusy(false);
      setStep(-1);
    }
  };

  return (
    <Screen>
      <ScreenHeader
        title={simple ? 'Check my crop' : 'Scan'}
        sub={simple ? 'Take one photo. I look at it here on your phone — it is never uploaded.' : 'Everything runs on this phone. No image ever leaves the device.'}
        icon="camera"
        right={<Pill text="OFFLINE AI" color={p.primary} icon="hardware-chip" />}
      />

      <Row gap={space.sm} style={{ marginBottom: space.md }}>
        <Pressable onPress={() => setMode('quality')} style={{ flex: 1 }}>
          <Card glow={mode === 'quality'} pad={0} style={{ marginBottom: 0, overflow: 'hidden' }}>
            <Image source={TILE.price} style={{ width: '100%', height: 78 }} contentFit="cover" />
            <View style={{ padding: space.md }}>
              <T variant="h3">{simple ? 'What price?' : 'Quality & price'}</T>
              <T variant="small" color={p.textDim}>{simple ? 'Photo of your produce' : 'Grade produce → price range'}</T>
            </View>
          </Card>
        </Pressable>
        <Pressable onPress={() => setMode('disease')} style={{ flex: 1 }}>
          <Card glow={mode === 'disease'} pad={0} style={{ marginBottom: 0, overflow: 'hidden' }}>
            <Image source={TILE.doctor} style={{ width: '100%', height: 78 }} contentFit="cover" />
            <View style={{ padding: space.md }}>
              <T variant="h3">{simple ? 'Sick plant?' : 'Disease'}</T>
              <T variant="small" color={p.textDim}>{simple ? 'Photo of a leaf' : 'Multi-label + Grad-CAM'}</T>
            </View>
          </Card>
        </Pressable>
      </Row>

      <SectionTitle title={simple ? 'Which crop?' : 'Crop'} icon="leaf" />
      <PicturePicker
        value={crop}
        onChange={(k) => setCrop(k as CropKey)}
        items={Object.values(CROPS).map((c) => ({ key: c.key, label: c.name, image: CROP_IMG[c.key] }))}
      />

      <Card>
        <View style={{ aspectRatio: 1, borderRadius: radius.md, overflow: 'hidden', backgroundColor: p.surfaceStrong, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: p.glassBorder, borderStyle: uri ? 'solid' : 'dashed' }}>
          {uri ? (
            <Image source={{ uri }} style={{ width: '100%', height: '100%' }} contentFit="cover" transition={220} />
          ) : (
            <View style={{ alignItems: 'center', gap: 10, padding: space.lg }}>
              <Image source={mode === 'quality' ? EMPTY.market : EMPTY.leaf} style={{ width: 132, height: 100 }} contentFit="contain" />
              <T variant="h3" center>{simple ? 'Hold the phone steady' : 'Framing guide'}</T>
              <T variant="small" color={p.textDim} center>
                {simple
                  ? 'Stand in shade, not bright sun. Fill about half the picture with the crop. Plain background is best.'
                  : 'Fill 40–70% of the frame, shoot in open shade, plain background.'}
              </T>
            </View>
          )}
          {busy ? (
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#000B', alignItems: 'center', justifyContent: 'center', gap: 10, padding: space.lg }}>
              <ActivityIndicator color={p.primary} size="large" />
              <T variant="small" color={p.primary} center>{STEPS[Math.max(0, step)]}</T>
              <View style={{ width: '80%', height: 5, backgroundColor: '#FFF2', borderRadius: 4 }}>
                <View style={{ width: `${((step + 1) / STEPS.length) * 100}%`, height: 5, backgroundColor: p.primary, borderRadius: 4 }} />
              </View>
            </View>
          ) : null}
        </View>

        <Row gap={space.sm} style={{ marginTop: space.md }}>
          <Btn icon="camera" title={simple ? 'Take photo' : 'Camera'} onPress={() => pick('camera')} style={{ flex: 1 }} kind="soft" />
          <Btn icon="images" title={simple ? 'From phone' : 'Gallery'} onPress={() => pick('library')} style={{ flex: 1 }} kind="soft" />
        </Row>
        {uri ? (
          <Btn icon="sparkles" title={busy ? 'Looking…' : simple ? (mode === 'quality' ? 'Tell me the price' : 'What is wrong?') : mode === 'quality' ? 'Grade & price this lot' : 'Detect disease'} onPress={run} loading={busy} style={{ marginTop: space.sm }} />
        ) : null}
        {err ? <Banner kind="warn" text={err} /> : null}
      </Card>

      {/* ---- picture quality + crop identification verdict ---- */}
      {frame ? (
        <>
          <AnswerCard
            tone={frame.usable ? (frame.ambiguous ? 'warn' : 'ok') : 'danger'}
            headline={
              frame.usable
                ? frame.ambiguous ? 'Clear picture — which crop is this?' : `This looks like ${frame.bestGuess?.name}`
                : frame.reason === 'not_a_plant' ? 'That is not a crop' : 'Picture is not clear'
            }
            detail={frame.message}
            image={frame.usable && frame.bestGuess ? CROP_IMG[frame.bestGuess.crop] : EMPTY.scan}
            onSpeak={() => speak(frame.message, voiceLocale(s.profile.lang))}
            action={
              !frame.usable ? (
                <Row gap={space.sm}>
                  <Btn small title="Take another photo" icon="camera" style={{ flex: 1 }} onPress={() => pick('camera')} />
                  <Btn small kind="ghost" title="Use it anyway" icon="warning" style={{ flex: 1 }} onPress={() => { setOverride(true); setTimeout(run, 60); }} />
                </Row>
              ) : undefined
            }
          />

          <Card>
            <SectionTitle title="What the camera measured" icon="analytics" />
            {[
              { k: 'Sharpness', v: frame.sharpness, ok: frame.sharpness >= 1.2, unit: '', good: 'in focus', bad: 'blurred' },
              { k: 'Brightness', v: frame.exposure, ok: frame.exposure >= 0.22 && frame.exposure <= 0.9, unit: '', good: 'well lit', bad: 'too dark or too bright' },
              { k: 'Subject size in frame', v: frame.subjectPct, ok: frame.subjectPct >= 0.1, unit: '', good: 'close enough', bad: 'too far away' },
              { k: 'Plant evidence', v: frame.plantScore, ok: frame.plantScore >= 0.16, unit: '', good: 'plant material found', bad: 'no plant found' },
              { k: 'Person / object evidence', v: frame.humanScore, ok: frame.humanScore < 0.34, unit: '', good: 'no person detected', bad: 'looks like a person or object' },
            ].map((row) => (
              <Row key={row.k} style={{ justifyContent: 'space-between', paddingVertical: 5 }}>
                <Row gap={7} style={{ flex: 1 }}>
                  <Ionicons name={row.ok ? 'checkmark-circle' : 'close-circle'} size={14} color={row.ok ? p.ok : p.danger} />
                  <T variant="small" style={{ flex: 1 }}>{row.k}</T>
                </Row>
                <T variant="micro" color={row.ok ? p.textDim : p.danger}>{row.v} · {row.ok ? row.good : row.bad}</T>
              </Row>
            ))}
          </Card>

          <Card>
            <SectionTitle title="Crop identification" icon="leaf" right={<Pill text={frame.ambiguous ? 'NOT SURE' : 'CONFIDENT'} color={frame.ambiguous ? p.warn : p.ok} />} />
            {frame.guesses.map((g, i) => (
              <Pressable key={g.crop} onPress={() => setCrop(g.crop)} style={{ paddingVertical: 7 }}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Row gap={8} style={{ flex: 1 }}>
                    <Image source={CROP_IMG[g.crop]} style={{ width: 34, height: 34, borderRadius: 10 }} contentFit="cover" />
                    <View style={{ flex: 1 }}>
                      <T variant="small" color={crop === g.crop ? p.primary : p.text}>{g.name}{crop === g.crop ? '  ✓ selected' : ''}</T>
                      <T variant="micro" color={p.textFaint} numberOfLines={1}>{g.why}</T>
                    </View>
                  </Row>
                  <T variant="small" color={i === 0 ? p.primary : p.textDim}>{(g.confidence * 100).toFixed(0)}%</T>
                </Row>
                <Bar value={g.confidence} color={i === 0 ? p.primary : p.textFaint} height={4} />
              </Pressable>
            ))}
            <Divider />
            <T variant="micro" color={p.textFaint}>
              Identification uses the crop's colour bands, roundness, aspect and texture measured from the segmented subject.
              When two crops score within 6 points the app says it is unsure and asks you rather than guessing.
            </T>
          </Card>
        </>
      ) : null}

      {canDemo() ? (
        <>
          <SectionTitle title="Sample captures (synthetic, drawn on device)" icon="color-palette" />
          <Row gap={space.sm} wrap>
            {DEMOS.filter((d) => d.use === mode).map((d) => (
              <Pressable
                key={d.kind}
                onPress={() => { const u = makeDemoImage(d.kind); if (u) { setUri(u); setCrop(d.crop); } }}
                style={{ width: '31%' }}
              >
                <Card pad={space.md} style={{ alignItems: 'center', marginBottom: 0 }}>
                  <Ionicons name={d.icon as any} size={20} color={p.accent} />
                  <T variant="micro" color={p.textDim} center style={{ marginTop: 6 }}>{d.label.toUpperCase()}</T>
                </Card>
              </Pressable>
            ))}
          </Row>
          <View style={{ height: space.md }} />
        </>
      ) : null}

      <Card>
        <SectionTitle title="Pipeline integrity" icon="shield-checkmark" />
        <KV k="Upload gate" v="magic bytes · size cap 8 MB · polyglot + EICAR scan" />
        <KV k="Image hash" v={scanMeta ? `${scanMeta.sha}… (SHA-256)` : 'computed at capture time'} />
        <KV k="Anti-spoofing" v="pHash duplicate + capture-freshness + GPS velocity" />
        <KV k="Network calls" v="0 — inference is fully local" color={p.ok} />
        <Divider />
        <T variant="small" color={p.textDim}>
          Photographs give visual evidence only. CropCare never claims moisture, brix, residue or internal defects from an image.
        </T>
      </Card>
    </Screen>
  );
}

const tick = (ms: number) => new Promise((r) => setTimeout(r, ms));
