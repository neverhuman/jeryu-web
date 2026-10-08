import type { Meta, StoryObj } from '@storybook/react-vite';

import { JeryuWordmark } from './JeryuWordmark';

const meta = { title: 'Brand/JeRyū wordmark', component: JeryuWordmark, parameters: { layout: 'centered' } } satisfies Meta<typeof JeryuWordmark>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Navigation: Story = { args: { variant: 'nav' } };
export const Hero: Story = { args: { variant: 'hero' } };
export const Decorative: Story = { args: { variant: 'nav', decorative: true } };
