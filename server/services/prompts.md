const DEFAULT_CATEGORIES: MoveCategory[] = [
    {
        id: 'cat-1',
        title: 'Dolly Moves',
        moves: [
            { id: 'm1', title: 'Slow Dolly In', description: 'Smooth physical camera movement push', prompt: 'Slow dolly in towards the subject, smooth physical camera movement on rails. Cinematic, high detail, realistic lighting, 4K.' },
            { id: 'm2', title: 'Slow Dolly Out', description: 'Smooth physical camera movement pull', prompt: 'Slow dolly out from the subject, revealing more of the landscape, smooth physical camera movement on rails. Cinematic, high detail, realistic lighting, 4K.' },
            { id: 'm3', title: 'Fast Dolly In (Crash)', description: 'Intense and dramatic physical camera push', prompt: 'Fast crash dolly in towards the subject, intense and dramatic physical camera push. Cinematic, high detail, realistic lighting, 4K.' },
            { id: 'm4', title: 'Dolly Zoom (Vertigo)', description: 'Camera dolly back while zooming in', prompt: 'Classic Vertigo effect: camera dolly back while zooming in on the distant subject, creating distorted perspective. Smooth cinematic movement, high detail, realistic lighting, 4K.' },
        ]
    },
    {
        id: 'cat-2',
        title: 'Infinite Scale',
        moves: [
            { id: 'm5', title: 'Extreme Macro Zoom', description: 'Face to Micro world', prompt: 'Smooth extreme macro zoom into the microscopic world, revealing tiny particles and reflections. Infinite scale continuity, high detail, realistic lighting, 4K.' },
            { id: 'm6', title: 'Cosmic Hyper-Zoom', description: 'Space to Street/Subject', prompt: 'Smooth hyper-zoom down through clouds, over landmarks, directly to the subject. Infinite scale continuity, epic cinematic movement, high detail, realistic lighting, 4K.' },
        ]
    },
    {
        id: 'cat-3',
        title: 'Character-Mounted',
        moves: [
            { id: 'm7', title: 'Over-the-Shoulder', description: 'OTS framing', prompt: 'Over-the-shoulder shot looking past the shoulder toward the subject. Smooth, stable framing, cinematic, high detail, realistic lighting, 4K.' },
            { id: 'm8', title: 'Fisheye Distortion', description: 'Extreme wide-angle', prompt: 'Viewed through a fisheye or peephole lens effect, extreme wide-angle distortion with curved horizon and bulging edges. Cinematic, high detail, realistic lighting, 4K.' },
        ]
    },
    {
        id: 'cat-4',
        title: 'Environmental Interaction',
        moves: [
            { id: 'm9', title: 'Reveal From Behind', description: 'Natural wipe reveal', prompt: 'Camera slowly moves sideways to reveal the subject behind an obstacle in the foreground. Natural wipe reveal, smooth cinematic movement, high detail, 4K.' },
            { id: 'm10', title: 'Fly-Through', description: 'Pushing through window/gap', prompt: 'Smooth fly-through shot pushing forward through a window or gap into the landscape. Cinematic, high detail, realistic lighting, 4K.' },
        ]
    },
    {
        id: 'cat-5',
        title: 'Focus & Lens',
        moves: [
            { id: 'm11', title: 'Reveal From Blur', description: 'Focus Pull from bokeh', prompt: 'Start completely out of focus. Smooth focus pull gradually revealing sharp details of the subject. Cinematic rack focus, high detail, realistic lighting, 4K.' },
            { id: 'm12', title: 'Rack Focus', description: 'Foreground to Background shift', prompt: 'Smooth rack focus shifting from foreground details to revealing the crisp subject and background behind. Cinematic, high detail, realistic lighting, 4K.' },
        ]
    },
    {
        id: 'cat-6',
        title: 'Rotational Moves',
        moves: [
            { id: 'm13', title: 'Tilt Up', description: 'Vertical rotation up', prompt: 'Smooth tilt up from the bottom to reveal the subject. Cinematic movement, high detail, realistic lighting, 4K.' },
            { id: 'm14', title: 'Tilt Down', description: 'Vertical rotation down', prompt: 'Smooth tilt down from the top to reveal the subject. Cinematic movement, high detail, realistic lighting, 4K.' },
        ]
    },
    {
        id: 'cat-7',
        title: 'Lateral Moves',
        moves: [
            { id: 'm15', title: 'Truck Left', description: 'Lateral slide left', prompt: 'Smooth truck left lateral slide on slider, revealing more of the landscape to the right. Cinematic movement, high detail, realistic lighting, 4K.' },
            { id: 'm16', title: 'Truck Right', description: 'Lateral slide right', prompt: 'Smooth truck right lateral slide on slider, revealing more of the landscape to the left. Cinematic movement, high detail, realistic lighting, 4K.' },
        ]
    },
    {
        id: 'cat-8',
        title: 'Orbital Moves',
        moves: [
            { id: 'm17', title: 'Orbit 180', description: 'Half circle orbit', prompt: 'Smooth 180-degree orbit clockwise around the subject, revealing changing perspective. Cinematic movement, high detail, realistic lighting, 4K.' },
            { id: 'm18', title: 'Fast 360 Orbit', description: 'Full dynamic circle', prompt: 'Fast full 360-degree orbit around the subject, dynamic and energetic. Cinematic movement, high detail, realistic lighting, 4K.' },
            { id: 'm19', title: 'Slow Cinematic Arc', description: 'Elegant 90-degree curve', prompt: 'Slow cinematic 90-degree arc orbit to the left, elegant and sweeping. High detail, realistic lighting, 4K.' },
        ]
    },
    {
        id: 'cat-9',
        title: 'Vertical Camera',
        moves: [
            { id: 'm20', title: 'Pedestal Down', description: 'Lowering camera height', prompt: 'Smooth pedestal down lowering the camera toward ground level, revealing more foreground details. Cinematic movement, high detail, realistic lighting, 4K.' },
            { id: 'm21', title: 'Pedestal Up', description: 'Raising camera height', prompt: 'Smooth pedestal up raising the camera higher, revealing wider landscape. Cinematic movement, high detail, realistic lighting, 4K.' },
            { id: 'm22', title: 'Crane Up Reveal', description: 'Rising high angle reveal', prompt: 'Smooth crane up rising high to reveal vast valley and surrounding mountains in epic high-angle view. Cinematic movement, high detail, realistic lighting, 4K.' },
            { id: 'm23', title: 'Crane Down Landing', description: 'Descending to subject level', prompt: 'Smooth crane down descending toward the subject, landing at ground level. Cinematic movement, high detail, realistic lighting, 4K.' },
        ]
    },
    {
        id: 'cat-10',
        title: 'Optical Lens Effects',
        moves: [
            { id: 'm24', title: 'Smooth Zoom In', description: 'Optical zoom in, static camera', prompt: 'Smooth optical zoom in toward the distant subject, no physical camera movement. Cinematic, high detail, realistic lighting, 4K.' },
            { id: 'm25', title: 'Smooth Zoom Out', description: 'Optical zoom out, static camera', prompt: 'Smooth optical zoom out revealing full landscape, no physical camera movement. Cinematic, high detail, realistic lighting, 4K.' },
            { id: 'm26', title: 'Snap Zoom (Crash)', description: 'Fast dramatic zoom', prompt: 'Sudden fast snap zoom (crash zoom) in to extreme close-up on the subject. Dramatic, high detail, realistic lighting, 4K.' },
        ]
    },
    {
        id: 'cat-11',
        title: 'Drone & Aerial',
        moves: [
            { id: 'm27', title: 'Drone Flyover', description: 'Smooth aerial path', prompt: 'Epic drone shot flying forward over the subject, smooth aerial movement, high detail, realistic lighting, 4K.' },
            { id: 'm28', title: 'Epic Drone Reveal', description: 'Revealing vast scale', prompt: 'Drone smooth epic reveal flying up and over an obstacle to unveil a vast landscape. Cinematic aerial, high detail, realistic lighting, 4K.' },
            { id: 'm29', title: 'Large Drone Orbit', description: '360 valley orbit', prompt: 'Large-scale drone orbit circling 360 degrees around the entire valley, showing full panoramic scale. Smooth aerial movement, high detail, realistic lighting, 4K.' },
            { id: 'm30', title: 'Top-Down (God Eye)', description: 'Direct satellite-style view', prompt: 'Direct top-down God eye view straight above the subject. Static or slow drift, high detail, realistic lighting, 4K.' },
            { id: 'm31', title: 'FPV Drone Dive', description: 'High speed vertical plunge', prompt: 'Fast FPV drone dive starting high above, plunging straight down toward the subject at thrilling speed. Dynamic first-person view, high detail, realistic lighting, 4K.' },
        ]
    },
    {
        id: 'cat-12',
        title: 'Dynamic Moves',
        moves: [
            { id: 'm32', title: 'Handheld Style', description: 'Slight natural shake', prompt: 'Handheld documentary-style shot with slight natural camera shake. Realistic movement, high detail, 4K.' },
            { id: 'm33', title: 'Whip Pan', description: 'Fast lateral blur transition', prompt: 'Extremely fast whip pan right to suddenly reveal the subject. Dynamic stylized movement, high detail, 4K.' },
            { id: 'm34', title: 'Dutch Angle', description: '35 degree camera roll', prompt: 'Filmed with strong Dutch angle camera roll (tilted 35 degrees), creating unease and drama. Cinematic, high detail, realistic lighting, 4K.' },
        ]
    },
    {
        id: 'cat-13',
        title: 'Subject Tracking',
        moves: [
            { id: 'm35', title: 'Leading Shot', description: 'Backward tracking', prompt: 'Camera tracks backward in front of the subject leading the way, maintaining eye contact framing. Smooth tracking, high detail, realistic lighting, 4K.' },
            { id: 'm36', title: 'Following Shot', description: 'Forward tracking', prompt: 'Camera smoothly follows behind the subject tracking forward. Cinematic, high detail, realistic lighting, 4K.' },
            { id: 'm37', title: 'Side Tracking', description: 'Parallel tracking', prompt: 'Camera tracks parallel sideways alongside the subject at matching speed. Smooth lateral tracking, high detail, realistic lighting, 4K.' },
            { id: 'm38', title: 'POV Walk', description: 'Immersive first-person', prompt: 'First-person POV walk, natural subtle head bob and breathing motion. Immersive handheld style, high detail, realistic lighting, 4K.' },
        ]
    }
];
