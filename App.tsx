import React from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import Ionicons from '@expo/vector-icons/Ionicons';
import { NavigationContainer, DarkTheme, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AppCtx, useApp, useAppState } from './lib/store';
import { RealtimeProvider } from './lib/rtcontext';
import { ThemeCtx, dark, light } from './lib/theme';
import { makeT } from './lib/i18n';

import HomeScreen from './screens/HomeScreen';
import SimpleHomeScreen from './screens/SimpleHomeScreen';
import AddFieldScreen from './screens/AddFieldScreen';
import WelcomeScreen from './screens/WelcomeScreen';
import ScanScreen from './screens/ScanScreen';
import MarketScreen from './screens/MarketScreen';
import TwinScreen from './screens/TwinScreen';
import HubScreen from './screens/HubScreen';
import QualityResultScreen from './screens/QualityResultScreen';
import DiseaseResultScreen from './screens/DiseaseResultScreen';
import IrrigationScreen from './screens/IrrigationScreen';
import AdvisorScreen from './screens/AdvisorScreen';
import MeshScreen from './screens/MeshScreen';
import PassportScreen from './screens/PassportScreen';
import FinanceScreen from './screens/FinanceScreen';
import ScoutingScreen from './screens/ScoutingScreen';
import OutbreakScreen from './screens/OutbreakScreen';
import LiveScreen from './screens/LiveScreen';
import AuthScreen from './screens/AuthScreen';
import FieldMapScreen from './screens/FieldMapScreen';
import CropDetailScreen from './screens/CropDetailScreen';
import SecurityScreen from './screens/SecurityScreen';
import EquipmentScreen from './screens/EquipmentScreen';
import SeedsScreen from './screens/SeedsScreen';
import LivestockScreen from './screens/LivestockScreen';
import ColdChainScreen from './screens/ColdChainScreen';
import IntercropScreen from './screens/IntercropScreen';
import PestSentinelScreen from './screens/PestSentinelScreen';
import FPOScreen from './screens/FPOScreen';
import CarbonScreen from './screens/CarbonScreen';
import AcademyScreen from './screens/AcademyScreen';
import FamilyScreen from './screens/FamilyScreen';
import ChannelsScreen from './screens/ChannelsScreen';
import RoboticsScreen from './screens/RoboticsScreen';
import DisasterScreen from './screens/DisasterScreen';
import ARSprayScreen from './screens/ARSprayScreen';
import SecureChatScreen from './screens/SecureChatScreen';
import SettingsScreen from './screens/SettingsScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const ICONS: Record<string, [string, string]> = {
  Home: ['home', 'home-outline'],
  Scan: ['camera', 'camera-outline'],
  Market: ['pricetag', 'pricetag-outline'],
  Ask: ['chatbubbles', 'chatbubbles-outline'],
  Hub: ['grid', 'grid-outline'],
};

function Tabs() {
  const { s } = useApp();
  const t = makeT(s.profile.lang);
  const p = s.settings.theme === 'dark' ? dark : light;
  const big = s.settings.elder;
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: p.primary,
        tabBarInactiveTintColor: p.textFaint,
        tabBarStyle: {
          backgroundColor: p.mode === 'dark' ? 'rgba(10,20,15,0.96)' : 'rgba(255,251,244,0.98)',
          borderTopColor: p.glassBorder,
          borderTopWidth: 1,
          height: (Platform.OS === 'ios' ? 88 : 68) + (big ? 10 : 0),
          paddingTop: 8,
          paddingBottom: Platform.OS === 'ios' ? 28 : 10,
        },
        tabBarLabelStyle: { fontSize: big ? 13 : 11.5, fontWeight: '700' },
        tabBarIcon: ({ focused, color, size }) => (
          <Ionicons name={(focused ? ICONS[route.name][0] : ICONS[route.name][1]) as any} size={size + (big ? 3 : 0)} color={color} />
        ),
      })}
    >
      <Tab.Screen name="Home" component={SimpleHomeScreen} options={{ title: t('home') }} />
      <Tab.Screen name="Scan" component={ScanScreen} options={{ title: s.settings.simple ? 'Check' : t('scan') }} />
      <Tab.Screen name="Market" component={MarketScreen} options={{ title: s.settings.simple ? 'Price' : t('market') }} />
      <Tab.Screen name="Ask" component={AdvisorScreen} options={{ title: s.settings.simple ? 'Ask' : t('advisor') }} />
      <Tab.Screen name="Hub" component={HubScreen} options={{ title: s.settings.simple ? 'All tools' : t('more') }} />
    </Tab.Navigator>
  );
}

const DETAILS: [string, React.ComponentType<any>, string][] = [
  ['Dashboard', HomeScreen, 'All numbers'],
  ['AddField', AddFieldScreen, 'Add a field'],
  ['Twin', TwinScreen, 'What if…'],
  ['QualityResult', QualityResultScreen, 'Quality & price'],
  ['DiseaseResult', DiseaseResultScreen, 'Diagnosis'],
  ['Irrigation', IrrigationScreen, 'Irrigation'],
  ['Advisor', AdvisorScreen, 'Agronomist'],
  ['Mesh', MeshScreen, 'Mesh sync'],
  ['Passport', PassportScreen, 'Farm Passport'],
  ['Finance', FinanceScreen, 'FarmScore'],
  ['Scouting', ScoutingScreen, 'Auto-scouting'],
  ['Outbreak', OutbreakScreen, 'Disease Watch'],
  ['Live', LiveScreen, 'Live'],
  ['FieldMap', FieldMapScreen, 'Field map'],
  ['CropDetail', CropDetailScreen, 'Crop details'],
  ['Security', SecurityScreen, 'Security centre'],
  ['Equipment', EquipmentScreen, 'Equipment'],
  ['Seeds', SeedsScreen, 'Seeds & varieties'],
  ['Livestock', LivestockScreen, 'Livestock'],
  ['ColdChain', ColdChainScreen, 'Cold chain'],
  ['Intercrop', IntercropScreen, 'Intercropping'],
  ['PestSentinel', PestSentinelScreen, 'Pest sentinel'],
  ['FPO', FPOScreen, 'FPO ledger'],
  ['Carbon', CarbonScreen, 'Carbon & pollinators'],
  ['Academy', AcademyScreen, 'Academy'],
  ['Family', FamilyScreen, 'Family'],
  ['Channels', ChannelsScreen, 'Channels'],
  ['Robotics', RoboticsScreen, 'Robotics'],
  ['Disaster', DisasterScreen, 'Disaster mode'],
  ['ARSpray', ARSprayScreen, 'Spray check'],
  ['SecureChat', SecureChatScreen, 'Encrypted chat'],
  ['Settings', SettingsScreen, 'Settings'],
];

function Shell() {
  const { s, set } = useApp();
  const scheme = s.settings.theme;
  const p = scheme === 'dark' ? dark : light;

  const themeValue = React.useMemo(
    () => ({
      p,
      scheme,
      toggle: () => set((d) => ({ ...d, settings: { ...d.settings, theme: d.settings.theme === 'dark' ? 'light' : 'dark' } })),
      elder: s.settings.elder,
      setElder: (v: boolean) => set((d) => ({ ...d, settings: { ...d.settings, elder: v } })),
      simple: s.settings.simple,
      setSimple: (v: boolean) => set((d) => ({ ...d, settings: { ...d.settings, simple: v } })),
    }),
    [scheme, s.settings.elder, s.settings.simple],
  );

  const navTheme = React.useMemo(
    () => ({
      ...(scheme === 'dark' ? DarkTheme : DefaultTheme),
      colors: {
        ...(scheme === 'dark' ? DarkTheme : DefaultTheme).colors,
        background: p.bg,
        card: p.bgAlt,
        text: p.text,
        border: p.glassBorder,
        primary: p.primary,
      },
    }),
    [scheme],
  );

  if (!s.ready) {
    return (
      <View style={{ flex: 1, backgroundColor: p.bg, alignItems: 'center', justifyContent: 'center', gap: 14 }}>
        <Ionicons name="leaf" size={44} color={p.primary} />
        <ActivityIndicator color={p.primary} />
      </View>
    );
  }

  return (
    <ThemeCtx.Provider value={themeValue}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <NavigationContainer theme={navTheme as any}>
        <Stack.Navigator
          screenOptions={{
            headerStyle: { backgroundColor: p.bgAlt },
            headerTintColor: p.text,
            headerTitleStyle: { fontWeight: '800', fontSize: 17 },
            headerShadowVisible: false,
            contentStyle: { backgroundColor: p.bg },
          }}
        >
          {!s.settings.onboarded ? (
            <Stack.Screen name="Welcome" component={AuthScreen} options={{ headerShown: false }} />
          ) : null}
          <Stack.Screen name="Tabs" component={Tabs} options={{ headerShown: false }} />
          {DETAILS.map(([name, Comp, title]) => (
            <Stack.Screen key={name} name={name} component={Comp} options={{ title }} />
          ))}
        </Stack.Navigator>
      </NavigationContainer>
    </ThemeCtx.Provider>
  );
}

export default function App() {
  const [fontsLoaded] = useFonts({ ...Ionicons.font });
  const app = useAppState();

  if (!fontsLoaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AppCtx.Provider value={app}>
          <RealtimeProvider>
            <Shell />
          </RealtimeProvider>
        </AppCtx.Provider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
