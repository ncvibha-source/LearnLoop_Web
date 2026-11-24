const uniqueSkills = [
    ...new Map(
        skills.map(s => [
            s.name.trim().toLowerCase(),
            s
        ])
    ).values()
];

const filtered = uniqueSkills.filter(s =>
    (s.name.toLowerCase().includes(q) ||
     s.description.toLowerCase().includes(q)) &&
    (c === 'all' || s.category === c)
);
