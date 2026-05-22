import React, { useEffect, useRef } from 'react';
import { StyleSheet, Pressable, Animated } from 'react-native';

interface CustomSwitchProps {
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
  activeColor?: string;
  inactiveColor?: string;
  thumbColor?: string;
  thumbActiveColor?: string;
}

export const CustomSwitch: React.FC<CustomSwitchProps> = ({
  value,
  onValueChange,
  disabled = false,
  activeColor = '#3B82F6', // Sleek primary blue
  inactiveColor,
  thumbColor = '#FFFFFF',
  thumbActiveColor = '#FFFFFF',
}) => {
  // Animation values
  const animatedValue = useRef(new Animated.Value(value ? 1 : 0)).current;
  const disabledAnimatedValue = useRef(new Animated.Value(disabled ? 1 : 0)).current;

  // Track state changes and animate knob position / color interpolation
  useEffect(() => {
    Animated.spring(animatedValue, {
      toValue: value ? 1 : 0,
      useNativeDriver: false, // color interpolation and layout styles like margin/left do not support native driver
      friction: 8,
      tension: 50,
    }).start();
  }, [value, animatedValue]);

  // Track disabled changes and animate opacity for premium micro-transition
  useEffect(() => {
    Animated.timing(disabledAnimatedValue, {
      toValue: disabled ? 1 : 0,
      duration: 250,
      useNativeDriver: false,
    }).start();
  }, [disabled, disabledAnimatedValue]);

  const handlePress = () => {
    if (!disabled) {
      onValueChange(!value);
    }
  };

  // Interpolate track background color
  const currentInactiveColor = inactiveColor || '#E2E8F0';
  const trackColor = animatedValue.interpolate({
    inputRange: [0, 1],
    outputRange: [currentInactiveColor, activeColor],
  });

  // Interpolate knob sliding position
  const knobTranslation = animatedValue.interpolate({
    inputRange: [0, 1],
    outputRange: [3, 23], // 50 width - 24 knob width - 3 margin = 23
  });

  // Interpolate thumb color if active/inactive are different
  const currentThumbColor = animatedValue.interpolate({
    inputRange: [0, 1],
    outputRange: [thumbColor, thumbActiveColor],
  });

  // Interpolate opacity for disabled state
  const opacity = disabledAnimatedValue.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0.4],
  });

  return (
    <Pressable onPress={handlePress} disabled={disabled}>
      <Animated.View
        style={[
          styles.track,
          {
            backgroundColor: trackColor,
            opacity: opacity,
          },
        ]}
      >
        <Animated.View
          style={[
            styles.thumb,
            {
              transform: [{ translateX: knobTranslation }],
              backgroundColor: currentThumbColor,
            },
          ]}
        />
      </Animated.View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  track: {
    width: 50,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    position: 'relative',
    // Subtle inner shadow effect
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 1,
  },
  thumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    position: 'absolute',
    left: 0,
    // Soft drop shadow for premium elevation
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 2.5,
    elevation: 3,
  },
});
