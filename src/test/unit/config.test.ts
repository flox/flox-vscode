/**
 * Unit tests for src/config.ts
 *
 * This file tests the type definitions and enums used throughout the extension.
 * These are simple structural tests to ensure the System enum has correct values
 * that match what Flox CLI expects.
 *
 * Why test this?
 * - The System enum values are used to match packages to platforms
 * - Incorrect values would cause packages to not be displayed for the current platform
 * - These values must match exactly what Flox CLI returns in manifest.lock
 */

import * as assert from 'assert';
import { System } from '../../config';

suite('Config Unit Tests', () => {
  /**
   * System Enum Tests
   *
   * The System enum defines the four supported platforms for Flox.
   * These values come from the Nix system naming convention and must match
   * exactly what appears in manifest.lock files.
   *
   * Format: <arch>-<os>
   * - arch: aarch64 (ARM64) or x86_64 (Intel/AMD 64-bit)
   * - os: linux or darwin (macOS)
   */
  suite('System Enum', () => {
    test('should have correct value for aarch64-linux (ARM64 Linux)', () => {
      // ARM64 Linux systems (e.g., Raspberry Pi 4, AWS Graviton)
      assert.strictEqual(System.AARCH64_LINUX, 'aarch64-linux');
    });

    test('should have correct value for aarch64-darwin (Apple Silicon macOS)', () => {
      // Apple Silicon Macs (M1, M2, M3, etc.)
      assert.strictEqual(System.AARCH64_DARWIN, 'aarch64-darwin');
    });

    test('should have correct value for x86_64-linux (Intel/AMD Linux)', () => {
      // Standard x86-64 Linux systems
      assert.strictEqual(System.X86_64_LINUX, 'x86_64-linux');
    });

    test('should have correct value for x86_64-darwin (Intel macOS)', () => {
      // Intel-based Macs
      assert.strictEqual(System.X86_64_DARWIN, 'x86_64-darwin');
    });

    test('should have exactly 4 system types', () => {
      // Flox currently supports exactly 4 platforms
      // If this changes, tests need to be updated
      const systemValues = Object.values(System);
      assert.strictEqual(systemValues.length, 4);
    });

    test('all system values should be unique', () => {
      // Each platform must have a unique identifier
      const systemValues = Object.values(System);
      const uniqueValues = new Set(systemValues);
      assert.strictEqual(uniqueValues.size, systemValues.length);
    });
  });
});
