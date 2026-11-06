import { parseAbi } from 'viem';

// Checked against the compiled contract by the experiment driver.
export const escrowEvents = parseAbi([
  'event EscrowCreated(uint256 indexed id, address indexed sender, address indexed beneficiary, address token, uint256 amount, uint64 cancelDeadline, uint64 expiresAt, uint64 createdAt)',
  'event EscrowCancelled(uint256 indexed id, address indexed sender)',
  'event EscrowReleased(uint256 indexed id, address indexed beneficiary)',
  'event EscrowRejected(uint256 indexed id, address indexed beneficiary)',
  'event EscrowExpired(uint256 indexed id, address indexed sender)',
]);
