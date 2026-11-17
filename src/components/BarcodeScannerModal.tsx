import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Platform,
  ActivityIndicator,
  Animated,
  Easing,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Typography, BorderRadius } from '../constants/theme';
import { notifyBarcodeScanned } from '../utils/feedback';

interface BarcodeScannerModalProps {
  visible: boolean;
  onClose: () => void;
  onScan: (barcode: string) => void;
  title?: string;
  allowContinuous?: boolean;
}

export const BarcodeScannerModal: React.FC<BarcodeScannerModalProps> = ({
  visible,
  onClose,
  onScan,
  title = 'बारकोड / QR कोड स्कैन करें',
  allowContinuous = true,
}) => {
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manualInput, setManualInput] = useState('');
  const [continuousMode, setContinuousMode] = useState(false);
  const [torchEnabled, setTorchEnabled] = useState(false);
  const [hasTorchCapability, setHasTorchCapability] = useState(false);
  const [lastScannedCode, setLastScannedCode] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanningRef = useRef<boolean>(false);
  const lastScanTimeRef = useRef<number>(0);
  const laserAnim = useRef(new Animated.Value(0)).current;

  // Animate laser scanning line up and down
  useEffect(() => {
    if (visible) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(laserAnim, {
            toValue: 1,
            duration: 1600,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(laserAnim, {
            toValue: 0,
            duration: 1600,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      laserAnim.stopAnimation();
    }
  }, [visible, laserAnim]);

  // Clean up media stream
  const stopStream = useCallback(() => {
    scanningRef.current = false;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
    setTorchEnabled(false);
  }, []);

  const handleBarcodeDetected = useCallback(
    (rawCode: string) => {
      const code = rawCode.trim();
      if (!code) return;

      const now = Date.now();
      // Cooldown to prevent duplicate reads of same barcode within 1.5 seconds
      if (code === lastScannedCode && now - lastScanTimeRef.current < 1500) {
        return;
      }

      lastScanTimeRef.current = now;
      setLastScannedCode(code);
      notifyBarcodeScanned();

      onScan(code);

      if (!continuousMode) {
        stopStream();
        onClose();
      }
    },
    [continuousMode, lastScannedCode, onClose, onScan, stopStream]
  );

  // Initialize camera and scanner loop
  useEffect(() => {
    if (!visible) {
      stopStream();
      setManualInput('');
      setLastScannedCode(null);
      setCameraError(null);
      return;
    }

    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.mediaDevices) {
      setCameraError(null);
      scanningRef.current = true;

      navigator.mediaDevices
        .getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        })
        .then((stream) => {
          streamRef.current = stream;
          setCameraActive(true);

          // Check torch capability
          try {
            const track = stream.getVideoTracks()[0];
            const caps: any = track.getCapabilities ? track.getCapabilities() : {};
            if (caps && caps.torch) {
              setHasTorchCapability(true);
            }
          } catch {
            setHasTorchCapability(false);
          }

          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.setAttribute('playsinline', 'true');
            videoRef.current.play().catch(() => {});
          }

          // Start Barcode Detection Loop
          const windowAny = window as any;
          if ('BarcodeDetector' in windowAny) {
            try {
              const formats = [
                'ean_13',
                'ean_8',
                'upc_a',
                'upc_e',
                'code_128',
                'code_39',
                'qr_code',
                'data_matrix',
              ];
              const barcodeDetector = new windowAny.BarcodeDetector({ formats });

              const detectFrame = async () => {
                if (!scanningRef.current || !videoRef.current) return;

                if (videoRef.current.readyState >= 2) {
                  try {
                    const barcodes = await barcodeDetector.detect(videoRef.current);
                    if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
                      handleBarcodeDetected(barcodes[0].rawValue);
                    }
                  } catch (detectErr) {
                    // Frame detection skip
                  }
                }

                if (scanningRef.current) {
                  requestAnimationFrame(detectFrame);
                }
              };

              requestAnimationFrame(detectFrame);
            } catch (err) {
              console.warn('BarcodeDetector initialization warning:', err);
            }
          }
        })
        .catch((err) => {
          console.warn('getUserMedia error:', err);
          setCameraError(
            'कैमरा शुरू नहीं हो सका (परमिशन नहीं मिली या कैमरा व्यस्त है)। आप नीचे हाथ से बारकोड दर्ज कर सकते हैं।'
          );
        });
    } else {
      setCameraError('इस डिवाइस/ब्राउज़र पर कैमरा उपलब्ध नहीं है। हाथ से बारकोड दर्ज करें।');
    }

    return () => {
      stopStream();
    };
  }, [visible, stopStream, handleBarcodeDetected]);

  // Toggle Torch / Flashlight
  const toggleTorch = async () => {
    if (!streamRef.current) return;
    try {
      const track = streamRef.current.getVideoTracks()[0];
      const nextTorch = !torchEnabled;
      await (track as any).applyConstraints({
        advanced: [{ torch: nextTorch }],
      });
      setTorchEnabled(nextTorch);
    } catch (err) {
      console.warn('Torch toggle error:', err);
    }
  };

  const handleManualSubmit = () => {
    const clean = manualInput.trim();
    if (!clean) return;
    handleBarcodeDetected(clean);
    setManualInput('');
  };

  const laserTranslateY = laserAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [10, 190],
  });

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={() => {
        stopStream();
        onClose();
      }}
    >
      <View style={styles.container}>
        {/* Header Bar */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={() => {
              stopStream();
              onClose();
            }}
          >
            <Ionicons name="close" size={24} color="#FFFFFF" />
          </TouchableOpacity>

          <View style={styles.titleContainer}>
            <Text style={styles.titleText}>{title}</Text>
            <Text style={styles.subtitleText}>
              {continuousMode ? 'मल्टी-स्कैन (लगातार जारी)' : 'सिंगल स्कैन'}
            </Text>
          </View>

          <View style={styles.headerActions}>
            {hasTorchCapability && (
              <TouchableOpacity
                style={[styles.actionIconBtn, torchEnabled && styles.actionIconBtnActive]}
                onPress={toggleTorch}
              >
                <Ionicons
                  name={torchEnabled ? 'flash' : 'flash-outline'}
                  size={20}
                  color={torchEnabled ? '#F59E0B' : '#FFFFFF'}
                />
              </TouchableOpacity>
            )}

            {allowContinuous && (
              <TouchableOpacity
                style={[styles.actionIconBtn, continuousMode && styles.actionIconBtnActive]}
                onPress={() => setContinuousMode(!continuousMode)}
              >
                <Ionicons
                  name="repeat"
                  size={20}
                  color={continuousMode ? '#10B981' : '#FFFFFF'}
                />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Viewfinder / Camera Section */}
        <View style={styles.cameraViewport}>
          {Platform.OS === 'web' && (
            <video
              ref={videoRef}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                position: 'absolute',
                top: 0,
                left: 0,
                backgroundColor: '#000000',
              }}
              muted
              autoPlay
              playsInline
            />
          )}

          {/* Semi-transparent dark masks around targeting box */}
          <View style={styles.overlayTop} />
          <View style={styles.overlayMiddleRow}>
            <View style={styles.overlaySide} />
            
            {/* Center Targeting Reticle Box */}
            <View style={styles.targetingBox}>
              {/* Corner brackets */}
              <View style={[styles.cornerBracket, styles.bracketTL]} />
              <View style={[styles.cornerBracket, styles.bracketTR]} />
              <View style={[styles.cornerBracket, styles.bracketBL]} />
              <View style={[styles.cornerBracket, styles.bracketBR]} />

              {/* Animated Laser Scanning Line */}
              <Animated.View
                style={[
                  styles.laserLine,
                  {
                    transform: [{ translateY: laserTranslateY }],
                  },
                ]}
              />

              {!cameraActive && !cameraError && (
                <ActivityIndicator size="large" color="#10B981" />
              )}
            </View>

            <View style={styles.overlaySide} />
          </View>
          <View style={styles.overlayBottom} />

          {/* Guide Instructions Text */}
          <View style={styles.instructionBanner}>
            <Ionicons name="scan-outline" size={18} color="#A7F3D0" />
            <Text style={styles.instructionText}>
              दवा की बोतल या बीज के पैकेट का बारकोड बॉक्स के बीच लाएं
            </Text>
          </View>
        </View>

        {/* Camera Error Message (if any) */}
        {cameraError && (
          <View style={styles.errorBanner}>
            <Ionicons name="alert-circle" size={18} color="#EF4444" />
            <Text style={styles.errorText}>{cameraError}</Text>
          </View>
        )}

        {/* Recent Scan Confirmation Toast */}
        {lastScannedCode && (
          <View style={styles.lastScanToast}>
            <Ionicons name="checkmark-circle" size={18} color="#10B981" />
            <Text style={styles.lastScanText}>
              स्कैन हुआ: <Text style={{ fontWeight: '700' }}>{lastScannedCode}</Text>
            </Text>
          </View>
        )}

        {/* Bottom Manual Entry & Barcode Gun Section */}
        <View style={styles.bottomBar}>
          <Text style={styles.manualEntryLabel}>
            या कीबोर्ड / बारकोड गन से नंबर दर्ज करें:
          </Text>
          <View style={styles.manualInputRow}>
            <View style={styles.inputWrapper}>
              <Ionicons name="barcode-outline" size={20} color={Colors.textSecondary} style={{ marginRight: 6 }} />
              <TextInput
                style={styles.textInput}
                placeholder="उदा. 8901234567890"
                placeholderTextColor="#9CA3AF"
                value={manualInput}
                onChangeText={setManualInput}
                keyboardType="default"
                returnKeyType="done"
                onSubmitEditing={handleManualSubmit}
              />
              {manualInput.length > 0 && (
                <TouchableOpacity onPress={() => setManualInput('')}>
                  <Ionicons name="close-circle" size={18} color="#9CA3AF" />
                </TouchableOpacity>
              )}
            </View>
            <TouchableOpacity
              style={[
                styles.submitBtn,
                !manualInput.trim() && { backgroundColor: '#6B7280' },
              ]}
              disabled={!manualInput.trim()}
              onPress={handleManualSubmit}
            >
              <Text style={styles.submitBtnText}>जोड़ें</Text>
              <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingTop: Platform.OS === 'ios' ? 44 : Spacing.md,
    paddingBottom: Spacing.md,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    zIndex: 10,
  },
  closeBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleContainer: {
    flex: 1,
    marginLeft: Spacing.sm,
  },
  titleText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  subtitleText: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionIconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionIconBtnActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderWidth: 1,
    borderColor: '#F59E0B',
  },
  cameraViewport: {
    flex: 1,
    position: 'relative',
    backgroundColor: '#000000',
  },
  overlayTop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
  },
  overlayMiddleRow: {
    flexDirection: 'row',
    height: 220,
  },
  overlaySide: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
  },
  targetingBox: {
    width: 270,
    height: 220,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  cornerBracket: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderColor: '#10B981',
  },
  bracketTL: {
    top: -1,
    left: -1,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderTopLeftRadius: 10,
  },
  bracketTR: {
    top: -1,
    right: -1,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderTopRightRadius: 10,
  },
  bracketBL: {
    bottom: -1,
    left: -1,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: 10,
  },
  bracketBR: {
    bottom: -1,
    right: -1,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: 10,
  },
  laserLine: {
    position: 'absolute',
    left: 8,
    right: 8,
    height: 3,
    backgroundColor: '#10B981',
    borderRadius: 2,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 6,
  },
  overlayBottom: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
  },
  instructionBanner: {
    position: 'absolute',
    bottom: 24,
    left: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  instructionText: {
    fontSize: 12,
    color: '#E2E8F0',
    textAlign: 'center',
    fontWeight: '500',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FEE2E2',
    padding: Spacing.sm,
    marginHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.xs,
  },
  errorText: {
    fontSize: 12,
    color: '#991B1B',
    flex: 1,
  },
  lastScanToast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    paddingVertical: 6,
    paddingHorizontal: Spacing.md,
    marginHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.xs,
  },
  lastScanText: {
    fontSize: 12,
    color: '#065F46',
  },
  bottomBar: {
    backgroundColor: '#1E293B',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: Platform.OS === 'ios' ? 34 : Spacing.md,
    borderTopWidth: 1,
    borderTopColor: '#334155',
  },
  manualEntryLabel: {
    fontSize: 11,
    color: '#94A3B8',
    marginBottom: 6,
  },
  manualInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  inputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.sm,
    height: 44,
  },
  textInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 14,
    height: '100%',
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.primary,
    height: 44,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    justifyContent: 'center',
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
});
