function getCardType() {
    // Get user's card type from session
    const session = typeof getSession === 'function' ? getSession() : null;
    let userCardType = 'Red'; // Fallback

    if (session && session.selectedCard) {
        const map = {
            'red': 'Red',
            'blue': 'Blue',
            'gold': 'Gold',
            'platinum': 'Platinum'
        };
        userCardType = map[session.selectedCard.toLowerCase()] || 'Red';
        if (session.selectedCard === 'new_user') userCardType = 'Red';
    } else {
        // Try localStorage fallback
        const storedCard = localStorage.getItem('selectedCard');
        if (storedCard) {
            const map = { 'red': 'Red', 'blue': 'Blue', 'gold': 'Gold', 'platinum': 'Platinum' };
            userCardType = map[storedCard.toLowerCase()] || 'Red';
        }
    }
    return userCardType;
}
