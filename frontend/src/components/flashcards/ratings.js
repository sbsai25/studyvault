// The four SM-2 ratings the review API accepts, with their keyboard shortcuts
export const RATINGS = [
  { value: 'again', label: 'Again', hint: 'Didn’t know it', key: '1' },
  { value: 'hard', label: 'Hard', hint: 'Got it with effort', key: '2' },
  { value: 'good', label: 'Good', hint: 'Knew it', key: '3' },
  { value: 'easy', label: 'Easy', hint: 'Knew it instantly', key: '4' },
];

export const ratingLabel = (value) => RATINGS.find((r) => r.value === value)?.label ?? value;
