/**
 * LMS Realistic Test Data Seeder
 * Seed identifier: LMS_HUMAN_WORKFLOW_TEST_2026_08
 * 
 * Creates 50 exams, 50 resources, and realistic student exam activity
 * using the EXISTING Prisma client, schemas, and business logic.
 * 
 * Usage: npx tsx src/scripts/seed-realistic-data.ts
 */

import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

// ============================================================================
// PRISMA CLIENT SETUP (standalone, mirrors src/lib/prisma.ts)
// ============================================================================
const DATABASE_URL = process.env.DATABASE_URL || "postgresql://postgres.rramkmudzrxaipukueuq:LMSPortal%40admin@aws-0-ap-south-1.pooler.supabase.com:6543/postgres?pgbouncer=true";

const pool = new Pool({
  connectionString: DATABASE_URL,
  max: 15,
  min: 3,
  idleTimeoutMillis: 60000,
  connectionTimeoutMillis: 15000,
  statement_timeout: 120000,
});

const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter, log: ['error', 'warn'] });

const EXAM_PREFIX = "seed-exam-";
const RESOURCE_PREFIX = "seed-res-";
const MAX_ATTEMPTS_PER_EXAM = 300;

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFloat(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function pickRandom<T>(arr: T[], count: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, arr.length));
}

function pastDate(daysAgo: number, hoursVariance: number = 12): Date {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(d.getHours() - randomInt(0, hoursVariance));
  return d;
}

function futureDate(daysAhead: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  d.setHours(d.getHours() + randomInt(0, 12));
  return d;
}

function generateScorePercentage(): number {
  const r = Math.random();
  if (r < 0.05) return randomFloat(90, 100);
  if (r < 0.20) return randomFloat(80, 89.9);
  if (r < 0.45) return randomFloat(70, 79.9);
  if (r < 0.70) return randomFloat(60, 69.9);
  if (r < 0.85) return randomFloat(50, 59.9);
  return randomFloat(15, 49.9);
}

// ============================================================================
// QUESTION GENERATORS
// ============================================================================

interface QT { text: string; options: string[]; correctAnswer: number; marks: number; explanation: string; difficulty: string; topic: string; }

function dsaQs(): QT[] {
  return [
    { text: "What is the time complexity of binary search on a sorted array?", options: ["O(n)", "O(log n)", "O(n log n)", "O(1)"], correctAnswer: 1, marks: 2, explanation: "Binary search halves the search space each step.", difficulty: "medium", topic: "Searching" },
    { text: "Which data structure uses LIFO principle?", options: ["Queue", "Stack", "Array", "Linked List"], correctAnswer: 1, marks: 1, explanation: "Stack follows Last In First Out.", difficulty: "easy", topic: "Stacks" },
    { text: "What is the worst-case time complexity of QuickSort?", options: ["O(n log n)", "O(n)", "O(n²)", "O(log n)"], correctAnswer: 2, marks: 2, explanation: "Worst case when pivot is always smallest/largest.", difficulty: "medium", topic: "Sorting" },
    { text: "Which BST traversal gives sorted order?", options: ["Preorder", "Postorder", "Inorder", "Level order"], correctAnswer: 2, marks: 1, explanation: "Inorder visits Left-Root-Right producing sorted output.", difficulty: "easy", topic: "Trees" },
    { text: "Space complexity of Merge Sort?", options: ["O(1)", "O(log n)", "O(n)", "O(n log n)"], correctAnswer: 2, marks: 2, explanation: "Merge Sort requires O(n) extra space for temporary arrays.", difficulty: "medium", topic: "Sorting" },
    { text: "In a max-heap, parent value is:", options: ["Less than children", "Equal to children", "Greater than or equal to children", "No relation"], correctAnswer: 2, marks: 1, explanation: "Max-heap property: parent >= children.", difficulty: "easy", topic: "Heaps" },
    { text: "Shortest path in weighted graph (no negative edges)?", options: ["DFS", "BFS", "Dijkstra's", "Bellman-Ford"], correctAnswer: 2, marks: 3, explanation: "Dijkstra's finds shortest paths with non-negative edges.", difficulty: "hard", topic: "Graphs" },
    { text: "Time complexity of inserting at head of singly linked list?", options: ["O(n)", "O(log n)", "O(1)", "O(n²)"], correctAnswer: 2, marks: 1, explanation: "Only head pointer update needed.", difficulty: "easy", topic: "Linked Lists" },
    { text: "Which is NOT a stable sorting algorithm?", options: ["Merge Sort", "Insertion Sort", "Bubble Sort", "Selection Sort"], correctAnswer: 3, marks: 2, explanation: "Selection Sort can change relative order of equal elements.", difficulty: "medium", topic: "Sorting" },
    { text: "Data structure for BFS?", options: ["Stack", "Queue", "Priority Queue", "Array"], correctAnswer: 1, marks: 1, explanation: "BFS uses a queue for level-by-level exploration.", difficulty: "easy", topic: "Graphs" },
    { text: "Amortized time of dynamic array push?", options: ["O(n)", "O(1)", "O(log n)", "O(n²)"], correctAnswer: 1, marks: 3, explanation: "Doubling strategy gives amortized O(1).", difficulty: "hard", topic: "Arrays" },
    { text: "Which problem uses Dynamic Programming?", options: ["Tower of Hanoi", "N-Queens", "Longest Common Subsequence", "Graph Coloring"], correctAnswer: 2, marks: 2, explanation: "LCS has optimal substructure and overlapping subproblems.", difficulty: "medium", topic: "DP" },
    { text: "Height of complete binary tree with n nodes?", options: ["O(n)", "O(log n)", "O(n log n)", "O(sqrt n)"], correctAnswer: 1, marks: 2, explanation: "Complete binary tree has height O(log n).", difficulty: "medium", topic: "Trees" },
    { text: "Hash collision resolution methods?", options: ["Only chaining", "Only open addressing", "Both", "Neither"], correctAnswer: 2, marks: 2, explanation: "Both chaining and open addressing resolve collisions.", difficulty: "medium", topic: "Hashing" },
    { text: "Hash table lookup with good hash function?", options: ["O(1)", "O(log n)", "O(n)", "O(n²)"], correctAnswer: 0, marks: 1, explanation: "Good hash function gives O(1) average lookup.", difficulty: "easy", topic: "Hashing" },
  ];
}

function dbmsQs(): QT[] {
  return [
    { text: "Which normal form eliminates transitive dependencies?", options: ["1NF", "2NF", "3NF", "BCNF"], correctAnswer: 2, marks: 2, explanation: "3NF eliminates transitive dependencies.", difficulty: "medium", topic: "Normalization" },
    { text: "What does ACID stand for?", options: ["Atomicity, Consistency, Isolation, Durability", "Association, Consistency, Integrity, Durability", "Atomicity, Concurrency, Isolation, Distribution", "Association, Concurrency, Integrity, Distribution"], correctAnswer: 0, marks: 1, explanation: "ACID: Atomicity, Consistency, Isolation, Durability.", difficulty: "easy", topic: "Transactions" },
    { text: "SQL command to remove all rows without logging each deletion?", options: ["DELETE", "DROP", "TRUNCATE", "REMOVE"], correctAnswer: 2, marks: 2, explanation: "TRUNCATE removes all rows efficiently.", difficulty: "medium", topic: "SQL" },
    { text: "Foreign key establishes:", options: ["Primary key constraint", "Referential integrity constraint", "Unique constraint", "Check constraint"], correctAnswer: 1, marks: 1, explanation: "FK enforces referential integrity.", difficulty: "easy", topic: "Constraints" },
    { text: "Which join returns all rows from both tables?", options: ["INNER JOIN", "LEFT JOIN", "RIGHT JOIN", "FULL OUTER JOIN"], correctAnswer: 3, marks: 2, explanation: "FULL OUTER returns all rows from both tables.", difficulty: "medium", topic: "SQL Joins" },
    { text: "What is a deadlock?", options: ["Transaction fails to commit", "Transactions wait for each other indefinitely", "DB runs out of memory", "Query too slow"], correctAnswer: 1, marks: 2, explanation: "Circular dependency in lock waiting.", difficulty: "medium", topic: "Concurrency" },
    { text: "Most common indexing technique?", options: ["Linear", "B-Tree", "Hash", "Bitmap"], correctAnswer: 1, marks: 2, explanation: "B-Tree supports range queries and O(log n) lookups.", difficulty: "medium", topic: "Indexing" },
    { text: "GROUP BY is used with:", options: ["WHERE clause", "Aggregate functions", "JOIN operations", "Subqueries"], correctAnswer: 1, marks: 1, explanation: "GROUP BY groups rows for aggregate functions.", difficulty: "easy", topic: "SQL" },
    { text: "Which is a NoSQL database?", options: ["PostgreSQL", "MySQL", "MongoDB", "Oracle"], correctAnswer: 2, marks: 1, explanation: "MongoDB is document-oriented NoSQL.", difficulty: "easy", topic: "DB Types" },
    { text: "Purpose of HAVING clause?", options: ["Filter rows before grouping", "Filter groups after GROUP BY", "Sort results", "Limit rows"], correctAnswer: 1, marks: 2, explanation: "HAVING filters groups, WHERE filters rows.", difficulty: "medium", topic: "SQL" },
    { text: "Weak entity in ER diagrams?", options: ["Single rectangle", "Double rectangle", "Diamond", "Oval"], correctAnswer: 1, marks: 2, explanation: "Weak entity shown as double rectangle.", difficulty: "medium", topic: "ER Modeling" },
    { text: "What is a view in SQL?", options: ["Physical table", "Virtual table based on query", "Index structure", "Stored procedure"], correctAnswer: 1, marks: 1, explanation: "A view is a virtual table from a stored query.", difficulty: "easy", topic: "SQL" },
  ];
}

function osQs(): QT[] {
  return [
    { text: "Which scheduling algorithm may cause starvation?", options: ["Round Robin", "FCFS", "SJF", "MLFQ"], correctAnswer: 2, marks: 2, explanation: "SJF can starve longer processes.", difficulty: "medium", topic: "Scheduling" },
    { text: "What is thrashing?", options: ["CPU overheating", "Excessive paging", "Memory fragmentation", "Disk failure"], correctAnswer: 1, marks: 2, explanation: "System spends more time swapping than executing.", difficulty: "medium", topic: "Virtual Memory" },
    { text: "Which is NOT a deadlock condition?", options: ["Mutual Exclusion", "Hold and Wait", "Preemption", "Circular Wait"], correctAnswer: 2, marks: 2, explanation: "No Preemption is the condition; Preemption prevents deadlock.", difficulty: "medium", topic: "Deadlocks" },
    { text: "LRU page replacement replaces:", options: ["First loaded page", "Least recently used page", "Optimal future page", "Random page"], correctAnswer: 1, marks: 1, explanation: "LRU replaces the page not used for longest.", difficulty: "easy", topic: "Virtual Memory" },
    { text: "Semaphore is used for:", options: ["Memory management", "Process synchronization", "File management", "Disk scheduling"], correctAnswer: 1, marks: 1, explanation: "Semaphores control concurrent access.", difficulty: "easy", topic: "Synchronization" },
    { text: "Most prone to external fragmentation?", options: ["Paging", "First Fit", "Best Fit", "Segmentation"], correctAnswer: 2, marks: 2, explanation: "Best Fit leaves many small holes.", difficulty: "medium", topic: "Memory" },
    { text: "TLB purpose?", options: ["Cache disk data", "Speed up virtual-to-physical translation", "Manage process queues", "Handle interrupts"], correctAnswer: 1, marks: 3, explanation: "TLB caches page table entries.", difficulty: "hard", topic: "Virtual Memory" },
    { text: "MLFQ: CPU-heavy process is:", options: ["Terminated", "Moved up", "Moved to lower priority queue", "Same queue"], correctAnswer: 2, marks: 2, explanation: "CPU-heavy processes get demoted.", difficulty: "medium", topic: "Scheduling" },
    { text: "Unix system call to create process?", options: ["exec()", "fork()", "create()", "spawn()"], correctAnswer: 1, marks: 1, explanation: "fork() creates a child process.", difficulty: "easy", topic: "Processes" },
    { text: "Kernel role?", options: ["UI only", "Core resource and hardware management", "File ops only", "Network only"], correctAnswer: 1, marks: 1, explanation: "Kernel manages CPU, memory, I/O.", difficulty: "easy", topic: "Fundamentals" },
  ];
}

function javaQs(): QT[] {
  return [
    { text: "Keyword to prevent method overriding?", options: ["static", "final", "abstract", "private"], correctAnswer: 1, marks: 1, explanation: "'final' prevents overriding.", difficulty: "easy", topic: "OOP" },
    { text: "Output: System.out.println(10+20+\"Hello\"+30+40)?", options: ["1020Hello3040", "30Hello3040", "30Hello70", "Error"], correctAnswer: 1, marks: 2, explanation: "10+20=30, then string concat.", difficulty: "medium", topic: "Strings" },
    { text: "Which allows duplicates and maintains order?", options: ["HashSet", "TreeSet", "ArrayList", "HashMap"], correctAnswer: 2, marks: 1, explanation: "ArrayList allows duplicates with insertion order.", difficulty: "easy", topic: "Collections" },
    { text: "Difference between == and .equals()?", options: ["No difference", "== references, .equals() values", "== values, .equals() references", ".equals() faster"], correctAnswer: 1, marks: 2, explanation: "== compares references, .equals() compares content.", difficulty: "medium", topic: "Fundamentals" },
    { text: "Purpose of 'volatile' keyword?", options: ["Makes constant", "Visibility across threads", "Prevents GC", "Thread-local"], correctAnswer: 1, marks: 3, explanation: "Ensures immediate visibility to all threads.", difficulty: "hard", topic: "Multithreading" },
    { text: "Automatic memory management feature?", options: ["Pointers", "Garbage Collection", "Manual dealloc", "Memory pool"], correctAnswer: 1, marks: 1, explanation: "GC automatically reclaims unreferenced memory.", difficulty: "easy", topic: "Memory" },
    { text: "What is an interface?", options: ["Class with static methods", "Blueprint with abstract methods", "Exception type", "Package"], correctAnswer: 1, marks: 1, explanation: "Interface contains abstract methods and constants.", difficulty: "easy", topic: "OOP" },
    { text: "Invalid array index throws?", options: ["NullPointerException", "ClassCastException", "ArrayIndexOutOfBoundsException", "ArithmeticException"], correctAnswer: 2, marks: 1, explanation: "AIOOBE for invalid array indices.", difficulty: "easy", topic: "Exceptions" },
    { text: "Method overloading means?", options: ["Same method in parent/child", "Same name, different params", "Method with no body", "Recursive method"], correctAnswer: 1, marks: 2, explanation: "Multiple methods, same name, different parameters.", difficulty: "medium", topic: "OOP" },
    { text: "Default boolean value?", options: ["true", "false", "null", "0"], correctAnswer: 1, marks: 1, explanation: "Boolean defaults to false.", difficulty: "easy", topic: "Fundamentals" },
    { text: "Parent class of all Java classes?", options: ["Main", "System", "Object", "Class"], correctAnswer: 2, marks: 1, explanation: "java.lang.Object is root of all classes.", difficulty: "easy", topic: "OOP" },
    { text: "What does 'synchronized' do?", options: ["Faster code", "Prevents concurrent execution", "Creates thread", "Stops thread"], correctAnswer: 1, marks: 2, explanation: "Only one thread can execute synchronized block.", difficulty: "medium", topic: "Multithreading" },
  ];
}

function pythonQs(): QT[] {
  return [
    { text: "Output of print(type([]))?", options: ["<class 'list'>", "<class 'tuple'>", "<class 'dict'>", "<class 'set'>"], correctAnswer: 0, marks: 1, explanation: "[] creates a list.", difficulty: "easy", topic: "Types" },
    { text: "Generator function keyword?", options: ["return", "yield", "generate", "async"], correctAnswer: 1, marks: 2, explanation: "'yield' makes a generator function.", difficulty: "medium", topic: "Generators" },
    { text: "What is list comprehension?", options: ["Sort lists", "Concise list creation", "Reverse lists", "Merge lists"], correctAnswer: 1, marks: 2, explanation: "Concise syntax: [expr for item in iterable].", difficulty: "medium", topic: "Lists" },
    { text: "'self' parameter refers to?", options: ["The class", "Current instance", "Parent class", "Global variable"], correctAnswer: 1, marks: 1, explanation: "'self' is the current instance.", difficulty: "easy", topic: "OOP" },
    { text: "What is a decorator?", options: ["Function modifying another function", "Loop type", "Data structure", "Class definition"], correctAnswer: 0, marks: 3, explanation: "Decorator extends function behavior.", difficulty: "hard", topic: "Advanced" },
    { text: "Add element to end of list?", options: ["insert()", "add()", "append()", "extend()"], correctAnswer: 2, marks: 1, explanation: "append() adds to the end.", difficulty: "easy", topic: "Lists" },
    { text: "Tuple vs List difference?", options: ["No difference", "Tuple mutable, list immutable", "Tuple immutable, list mutable", "Tuple faster"], correctAnswer: 2, marks: 1, explanation: "Tuples are immutable, lists are mutable.", difficulty: "easy", topic: "Types" },
    { text: "__init__ method does?", options: ["Destroys object", "Initializes attributes", "Imports module", "Copies object"], correctAnswer: 1, marks: 1, explanation: "__init__ is the constructor.", difficulty: "easy", topic: "OOP" },
    { text: "Exception handling syntax?", options: ["try-catch", "try-except", "try-handle", "try-throw"], correctAnswer: 1, marks: 1, explanation: "Python uses try-except.", difficulty: "easy", topic: "Exceptions" },
    { text: "Output of 2 ** 3 ** 2?", options: ["64", "512", "8", "36"], correctAnswer: 1, marks: 3, explanation: "Right-associative: 3**2=9, 2**9=512.", difficulty: "hard", topic: "Operators" },
  ];
}

function cnQs(): QT[] {
  return [
    { text: "OSI layer responsible for routing?", options: ["Data Link", "Network", "Transport", "Session"], correctAnswer: 1, marks: 1, explanation: "Network Layer (3) handles routing.", difficulty: "easy", topic: "OSI" },
    { text: "Default HTTP port?", options: ["21", "22", "80", "443"], correctAnswer: 2, marks: 1, explanation: "HTTP uses port 80.", difficulty: "easy", topic: "Protocols" },
    { text: "Which protocol is connectionless?", options: ["TCP", "UDP", "FTP", "HTTP"], correctAnswer: 1, marks: 1, explanation: "UDP sends data without connection.", difficulty: "easy", topic: "Transport" },
    { text: "ARP purpose?", options: ["Domain to IP", "IP to MAC address", "Encrypt data", "Route packets"], correctAnswer: 1, marks: 2, explanation: "ARP maps IP to MAC addresses.", difficulty: "medium", topic: "Protocols" },
    { text: "Topology requiring most cable?", options: ["Star", "Bus", "Ring", "Mesh"], correctAnswer: 3, marks: 2, explanation: "Mesh connects every pair of devices.", difficulty: "medium", topic: "Topology" },
    { text: "Subnet mask for /24?", options: ["255.0.0.0", "255.255.0.0", "255.255.255.0", "255.255.255.255"], correctAnswer: 2, marks: 1, explanation: "/24 = 255.255.255.0.", difficulty: "easy", topic: "IP Addressing" },
    { text: "Secure file transfer protocol?", options: ["FTP", "SFTP", "SMTP", "HTTP"], correctAnswer: 1, marks: 1, explanation: "SFTP encrypts file transfers.", difficulty: "easy", topic: "Protocols" },
    { text: "DNS stands for?", options: ["Dynamic Network Service", "Domain Name System", "Data Network Standard", "Distributed Naming"], correctAnswer: 1, marks: 1, explanation: "DNS translates domain names to IPs.", difficulty: "easy", topic: "DNS" },
    { text: "TCP reliable delivery mechanism?", options: ["Checksum only", "ACKs and retransmission", "Encryption", "Fragmentation"], correctAnswer: 1, marks: 2, explanation: "TCP uses ACKs and retransmission.", difficulty: "medium", topic: "Transport" },
    { text: "What is CIDR?", options: ["Cable standard", "IP allocation with prefix length", "Routing protocol", "Firewall type"], correctAnswer: 1, marks: 2, explanation: "CIDR uses prefix length for flexible addressing.", difficulty: "medium", topic: "IP Addressing" },
  ];
}

function webQs(): QT[] {
  return [
    { text: "'use strict' directive does?", options: ["Faster code", "Catches common errors in strict mode", "Imports modules", "Enables async"], correctAnswer: 1, marks: 2, explanation: "Strict mode catches unsafe actions.", difficulty: "medium", topic: "JavaScript" },
    { text: "CSS flexbox container property?", options: ["display: block", "display: flex", "display: grid", "display: inline"], correctAnswer: 1, marks: 1, explanation: "display: flex creates flex container.", difficulty: "easy", topic: "CSS" },
    { text: "Virtual DOM in React?", options: ["Actual DOM", "Lightweight DOM copy in memory", "CSS framework", "SSR technique"], correctAnswer: 1, marks: 2, explanation: "Virtual DOM is an in-memory representation.", difficulty: "medium", topic: "React" },
    { text: "Which HTTP method is idempotent?", options: ["POST", "PATCH", "PUT", "None"], correctAnswer: 2, marks: 2, explanation: "PUT is idempotent.", difficulty: "medium", topic: "HTTP" },
    { text: "Closure in JavaScript?", options: ["Close window", "Function accessing outer scope after return", "Loop type", "End execution"], correctAnswer: 1, marks: 3, explanation: "Closure captures surrounding lexical environment.", difficulty: "hard", topic: "JavaScript" },
    { text: "HTML hyperlink element?", options: ["<link>", "<a>", "<href>", "<url>"], correctAnswer: 1, marks: 1, explanation: "<a> creates hyperlinks.", difficulty: "easy", topic: "HTML" },
    { text: "localStorage purpose?", options: ["Session data", "Persistent browser storage", "Image cache", "Cookie management"], correctAnswer: 1, marks: 1, explanation: "localStorage stores data persistently.", difficulty: "easy", topic: "Web APIs" },
    { text: "CORS stands for?", options: ["Cross-Origin Resource Sharing", "Common Object Request Service", "Client-Origin Request Standard", "Cross-Object Reference"], correctAnswer: 0, marks: 2, explanation: "CORS allows cross-domain requests.", difficulty: "medium", topic: "Security" },
    { text: "NOT a valid JS data type?", options: ["undefined", "boolean", "float", "symbol"], correctAnswer: 2, marks: 1, explanation: "JS has 'number' not 'float'.", difficulty: "easy", topic: "JavaScript" },
    { text: "useEffect hook purpose?", options: ["Create state", "Perform side effects", "Create classes", "Handle routing"], correctAnswer: 1, marks: 2, explanation: "useEffect handles side effects.", difficulty: "medium", topic: "React" },
  ];
}

function seQs(): QT[] {
  return [
    { text: "Iterative and incremental model?", options: ["Waterfall", "V-Model", "Agile", "Big Bang"], correctAnswer: 2, marks: 1, explanation: "Agile uses iterative incremental development.", difficulty: "easy", topic: "SDLC" },
    { text: "Unit testing purpose?", options: ["Test entire system", "Test individual components", "Test UI", "Test database"], correctAnswer: 1, marks: 1, explanation: "Unit testing verifies individual components.", difficulty: "easy", topic: "Testing" },
    { text: "SOLID 'S' stands for?", options: ["Simple Responsibility", "Single Responsibility", "Software Responsibility", "Structured Responsibility"], correctAnswer: 1, marks: 2, explanation: "Single Responsibility: one reason to change.", difficulty: "medium", topic: "Design" },
    { text: "UML diagram for message sequences?", options: ["Class", "Use Case", "Sequence", "Activity"], correctAnswer: 2, marks: 1, explanation: "Sequence diagrams show message order.", difficulty: "easy", topic: "UML" },
    { text: "Sprint in Scrum?", options: ["Long-term plan", "Time-boxed iteration (2-4 weeks)", "Daily meeting", "Milestone"], correctAnswer: 1, marks: 1, explanation: "Sprint is a fixed-length iteration.", difficulty: "easy", topic: "Agile" },
    { text: "Code refactoring is?", options: ["Adding features", "Restructuring without behavior change", "Debugging", "Writing tests"], correctAnswer: 1, marks: 2, explanation: "Refactoring improves structure, not behavior.", difficulty: "medium", topic: "Quality" },
    { text: "Pattern ensuring single instance?", options: ["Factory", "Observer", "Singleton", "Strategy"], correctAnswer: 2, marks: 2, explanation: "Singleton restricts to one instance.", difficulty: "medium", topic: "Patterns" },
    { text: "CI means?", options: ["Deploy to production", "Auto build & test on commit", "Manual review", "Project management"], correctAnswer: 1, marks: 2, explanation: "CI auto builds and tests on commit.", difficulty: "medium", topic: "DevOps" },
    { text: "Version control purpose?", options: ["Encrypt code", "Track changes and collaborate", "Compile faster", "Run tests"], correctAnswer: 1, marks: 1, explanation: "Version control tracks code history.", difficulty: "easy", topic: "Tools" },
    { text: "Use case is?", options: ["Bug report", "User-system interaction description", "Design pattern", "Test case"], correctAnswer: 1, marks: 1, explanation: "Use case describes user-system interaction.", difficulty: "easy", topic: "Requirements" },
  ];
}

function aiQs(): QT[] {
  return [
    { text: "ML type using labeled data?", options: ["Unsupervised", "Reinforcement", "Supervised", "Semi-supervised"], correctAnswer: 2, marks: 1, explanation: "Supervised uses labeled training data.", difficulty: "easy", topic: "ML Basics" },
    { text: "What is overfitting?", options: ["Good on both sets", "Good on train, bad on test", "Fails to learn", "Too simple"], correctAnswer: 1, marks: 2, explanation: "Overfitting memorizes noise in training data.", difficulty: "medium", topic: "ML" },
    { text: "Activation function with 0-1 output?", options: ["ReLU", "Sigmoid", "Tanh", "Leaky ReLU"], correctAnswer: 1, marks: 1, explanation: "Sigmoid maps to (0,1).", difficulty: "easy", topic: "Neural Networks" },
    { text: "Backpropagation purpose?", options: ["Init weights", "Calculate gradients for weight updates", "Select features", "Normalize data"], correctAnswer: 1, marks: 2, explanation: "Backprop computes gradients for descent.", difficulty: "medium", topic: "Neural Networks" },
    { text: "Confusion matrix is?", options: ["Random matrix", "Predicted vs actual classifications table", "Weight matrix", "Distance matrix"], correctAnswer: 1, marks: 2, explanation: "Shows TP, TN, FP, FN for classification.", difficulty: "medium", topic: "Evaluation" },
    { text: "Dimensionality reduction algorithm?", options: ["K-means", "Linear Regression", "PCA", "Random Forest"], correctAnswer: 2, marks: 2, explanation: "PCA finds principal components of max variance.", difficulty: "medium", topic: "Preprocessing" },
    { text: "Vanishing gradient problem?", options: ["Gradients too large", "Gradients too small in deep networks", "Too few params", "Loss not differentiable"], correctAnswer: 1, marks: 3, explanation: "Gradients become exponentially small in deep nets.", difficulty: "hard", topic: "Deep Learning" },
    { text: "Transfer learning is?", options: ["Moving data", "Reusing pre-trained model knowledge", "Training multiple models", "Data format conversion"], correctAnswer: 1, marks: 2, explanation: "Leverage pre-trained model for new tasks.", difficulty: "medium", topic: "Deep Learning" },
    { text: "Binary classification loss function?", options: ["MSE", "Binary Cross-Entropy", "Hinge Loss", "Huber Loss"], correctAnswer: 1, marks: 2, explanation: "BCE measures divergence for binary labels.", difficulty: "medium", topic: "Training" },
    { text: "Neural network epoch is?", options: ["Single weight update", "One full pass through training data", "Single batch", "Final layer"], correctAnswer: 1, marks: 1, explanation: "Epoch = one complete pass through dataset.", difficulty: "easy", topic: "Training" },
  ];
}

function secQs(): QT[] {
  return [
    { text: "SQL injection is?", options: ["Inserting malicious SQL into queries", "DDoS attack", "Encrypting databases", "Firewall config"], correctAnswer: 0, marks: 2, explanation: "Exploits by inserting malicious SQL.", difficulty: "medium", topic: "Web Security" },
    { text: "Same key for encrypt/decrypt?", options: ["Asymmetric", "Symmetric", "Hashing", "Digital signature"], correctAnswer: 1, marks: 1, explanation: "Symmetric uses one shared key.", difficulty: "easy", topic: "Cryptography" },
    { text: "Phishing is?", options: ["Malware type", "Social engineering with fake emails/sites", "Network scanning", "Firewall type"], correctAnswer: 1, marks: 1, explanation: "Tricks users into revealing credentials.", difficulty: "easy", topic: "Social Engineering" },
    { text: "HTTPS provides over HTTP?", options: ["Faster loading", "Encrypted communication", "Better SEO", "More features"], correctAnswer: 1, marks: 1, explanation: "HTTPS adds TLS/SSL encryption.", difficulty: "easy", topic: "Web Security" },
    { text: "Firewall is?", options: ["Antivirus", "Network security device monitoring traffic", "Encryption type", "Password manager"], correctAnswer: 1, marks: 1, explanation: "Monitors and controls traffic by rules.", difficulty: "easy", topic: "Network Security" },
    { text: "VPN purpose?", options: ["Increase speed", "Secure encrypted connection over public network", "Block ads", "Manage passwords"], correctAnswer: 1, marks: 1, explanation: "VPN creates encrypted tunnel.", difficulty: "easy", topic: "Network Security" },
    { text: "2FA means?", options: ["Two passwords", "Two different verification types", "Two accounts", "Encrypt twice"], correctAnswer: 1, marks: 1, explanation: "Two different authentication factors.", difficulty: "easy", topic: "Authentication" },
    { text: "DDoS attack is?", options: ["Encryption type", "Flooding server from multiple sources", "Social engineering", "Malware type"], correctAnswer: 1, marks: 2, explanation: "DDoS overwhelms with distributed traffic.", difficulty: "medium", topic: "Attacks" },
    { text: "Authentication vs Authorization?", options: ["Same thing", "Auth verifies identity, authz determines access", "Auth determines access, authz verifies identity", "Both same"], correctAnswer: 1, marks: 2, explanation: "Authentication = who, Authorization = what access.", difficulty: "medium", topic: "Concepts" },
    { text: "Zero-day vulnerability?", options: ["Patched vulnerability", "Unknown flaw with no fix", "Old software bug", "Malware type"], correctAnswer: 1, marks: 3, explanation: "Unknown to vendor, no patch available.", difficulty: "hard", topic: "Vulnerabilities" },
  ];
}

// Exam templates
const TEMPLATES: Array<{ title: string; desc: string; subject: string; qFn: () => QT[] }> = [
  { title: "Data Structures & Algorithms — Mid Term Assessment", desc: "Comprehensive DSA assessment.", subject: "DSA", qFn: dsaQs },
  { title: "Data Structures — Internal Examination I", desc: "Internal exam on linear data structures.", subject: "DSA", qFn: dsaQs },
  { title: "Algorithms — Graph & Tree Assessment", desc: "Graph traversals and BST assessment.", subject: "Algorithms", qFn: dsaQs },
  { title: "DSA — Sorting & Searching Techniques", desc: "Sorting algorithms and binary search.", subject: "DSA", qFn: dsaQs },
  { title: "Advanced Data Structures — Final Assessment", desc: "Heaps, hash tables, and graphs.", subject: "DSA", qFn: dsaQs },
  { title: "DBMS — SQL & Normalization Assessment", desc: "SQL queries and normalization.", subject: "DBMS", qFn: dbmsQs },
  { title: "Database Management — ER Modeling & SQL", desc: "ER modeling and SQL operations.", subject: "DBMS", qFn: dbmsQs },
  { title: "DBMS — Transactions & Concurrency", desc: "ACID and concurrency control.", subject: "DBMS", qFn: dbmsQs },
  { title: "SQL Fundamentals — Practical Assessment", desc: "Practical SQL assessment.", subject: "DBMS", qFn: dbmsQs },
  { title: "Database Systems — Comprehensive Exam", desc: "Complete DBMS coverage.", subject: "DBMS", qFn: dbmsQs },
  { title: "Operating Systems — Internal Examination", desc: "Process and memory management.", subject: "OS", qFn: osQs },
  { title: "OS — Process Scheduling & Synchronization", desc: "CPU scheduling and semaphores.", subject: "OS", qFn: osQs },
  { title: "Operating Systems — Memory Management", desc: "Virtual memory and paging.", subject: "OS", qFn: osQs },
  { title: "OS Concepts — Mid Semester Assessment", desc: "Process states and scheduling.", subject: "OS", qFn: osQs },
  { title: "Operating Systems — Final Module Assessment", desc: "Disk scheduling and file systems.", subject: "OS", qFn: osQs },
  { title: "Java Programming — Unit Assessment", desc: "Java fundamentals and OOP.", subject: "Java", qFn: javaQs },
  { title: "Object-Oriented Programming with Java", desc: "Classes and inheritance.", subject: "Java", qFn: javaQs },
  { title: "Java Collections & Multithreading", desc: "Collections framework and threading.", subject: "Java", qFn: javaQs },
  { title: "Core Java — Programming Fundamentals", desc: "Data types and control flow.", subject: "Java", qFn: javaQs },
  { title: "Advanced Java — Internal Assessment", desc: "JDBC and design patterns.", subject: "Java", qFn: javaQs },
  { title: "Python Programming — Fundamentals", desc: "Python basics and data types.", subject: "Python", qFn: pythonQs },
  { title: "Python — Object-Oriented Programming", desc: "OOP in Python.", subject: "Python", qFn: pythonQs },
  { title: "Python Data Structures & Algorithms", desc: "Lists, dicts, and algorithms.", subject: "Python", qFn: pythonQs },
  { title: "Python — Advanced Concepts Assessment", desc: "Generators and decorators.", subject: "Python", qFn: pythonQs },
  { title: "Python for Data Science — Fundamentals", desc: "Python for data analysis.", subject: "Python", qFn: pythonQs },
  { title: "Computer Networks — Module 3 Assessment", desc: "Network layer and routing.", subject: "CN", qFn: cnQs },
  { title: "Computer Networks — OSI & TCP/IP Models", desc: "OSI layers and TCP/IP.", subject: "CN", qFn: cnQs },
  { title: "Networking — Transport & Application Layer", desc: "TCP, UDP, HTTP, DNS.", subject: "CN", qFn: cnQs },
  { title: "Data Communication & Networking", desc: "Transmission and error detection.", subject: "CN", qFn: cnQs },
  { title: "Computer Networks — Security & Protocols", desc: "Network security and encryption.", subject: "CN", qFn: cnQs },
  { title: "Web Development — Full Stack Assessment", desc: "HTML, CSS, JS, React.", subject: "WebDev", qFn: webQs },
  { title: "Frontend Development — HTML, CSS & JS", desc: "Frontend technologies.", subject: "WebDev", qFn: webQs },
  { title: "React.js — Component Architecture", desc: "React components and hooks.", subject: "WebDev", qFn: webQs },
  { title: "Web Technologies — HTTP & APIs", desc: "REST APIs and HTTP.", subject: "WebDev", qFn: webQs },
  { title: "JavaScript — Modern ES6+ Features", desc: "Arrow functions and promises.", subject: "WebDev", qFn: webQs },
  { title: "Software Engineering — Internal Assessment", desc: "SDLC and requirements.", subject: "SE", qFn: seQs },
  { title: "Software Engineering — Agile & Scrum", desc: "Agile methodology.", subject: "SE", qFn: seQs },
  { title: "Software Design Patterns & Principles", desc: "SOLID and design patterns.", subject: "SE", qFn: seQs },
  { title: "Software Testing — Fundamentals", desc: "Unit testing and TDD.", subject: "SE", qFn: seQs },
  { title: "Software Project Management Assessment", desc: "Planning and estimation.", subject: "SE", qFn: seQs },
  { title: "Artificial Intelligence — Fundamentals", desc: "ML basics and neural networks.", subject: "AI", qFn: aiQs },
  { title: "Machine Learning — Supervised Learning", desc: "Classification and regression.", subject: "AI", qFn: aiQs },
  { title: "Deep Learning — Neural Architectures", desc: "CNNs and backpropagation.", subject: "AI", qFn: aiQs },
  { title: "AI & ML — Model Evaluation & Tuning", desc: "Overfitting and cross-validation.", subject: "AI", qFn: aiQs },
  { title: "Introduction to AI — Comprehensive", desc: "Search and ML fundamentals.", subject: "AI", qFn: aiQs },
  { title: "Cyber Security — Security Concepts", desc: "Authentication and encryption.", subject: "Security", qFn: secQs },
  { title: "Information Security — Cryptography", desc: "Symmetric/asymmetric encryption.", subject: "Security", qFn: secQs },
  { title: "Network Security — Threats & Countermeasures", desc: "Firewalls and VPNs.", subject: "Security", qFn: secQs },
  { title: "Web Application Security Assessment", desc: "SQL injection and OWASP.", subject: "Security", qFn: secQs },
  { title: "Ethical Hacking — Fundamentals", desc: "Pen testing and vulnerability assessment.", subject: "Security", qFn: secQs },
];

// Resource templates
const RES_TEMPLATES = [
  { title: "Data Structures Complete Notes", cat: "Course Notes", url: "https://www.geeksforgeeks.org/data-structures/" },
  { title: "DBMS SQL Practice Guide", cat: "Practice Material", url: "https://www.w3schools.com/sql/" },
  { title: "Operating Systems Revision Notes", cat: "Revision Notes", url: "https://www.geeksforgeeks.org/operating-systems/" },
  { title: "Java Programming Handbook", cat: "Reference", url: "https://docs.oracle.com/javase/tutorial/" },
  { title: "Python Fundamentals", cat: "Course Notes", url: "https://docs.python.org/3/tutorial/" },
  { title: "Computer Networks Revision Material", cat: "Revision Notes", url: "https://www.geeksforgeeks.org/computer-network-tutorials/" },
  { title: "Web Development Guide", cat: "Reference", url: "https://developer.mozilla.org/en-US/docs/Learn" },
  { title: "Artificial Intelligence Study Material", cat: "Course Notes", url: "https://www.geeksforgeeks.org/artificial-intelligence-an-introduction/" },
  { title: "Cyber Security Fundamentals", cat: "Course Notes", url: "https://www.cybrary.it/" },
  { title: "Software Engineering Unit Notes", cat: "Course Notes", url: "https://www.geeksforgeeks.org/software-engineering/" },
  { title: "Algorithm Visualization Guide", cat: "Learning Tool", url: "https://visualgo.net/en" },
  { title: "Git & GitHub Tutorial", cat: "Tutorial", url: "https://docs.github.com/en/get-started" },
  { title: "React.js Official Documentation", cat: "Reference", url: "https://react.dev/learn" },
  { title: "SQL Query Practice Problems", cat: "Practice", url: "https://leetcode.com/problemset/database/" },
  { title: "Linux Command Line Essentials", cat: "Reference", url: "https://linuxcommand.org/" },
  { title: "ML with Python — Complete Guide", cat: "Course Notes", url: "https://scikit-learn.org/stable/tutorial/" },
  { title: "CSS Flexbox & Grid Cheatsheet", cat: "Quick Reference", url: "https://css-tricks.com/snippets/css/a-guide-to-flexbox/" },
  { title: "Database Normalization Explained", cat: "Tutorial", url: "https://www.studytonight.com/dbms/database-normalization.php" },
  { title: "TCP/IP Protocol Suite Reference", cat: "Reference", url: "https://www.rfc-editor.org/" },
  { title: "JavaScript ES6+ Features Summary", cat: "Quick Reference", url: "https://es6-features.org/" },
  { title: "OOP Design Patterns", cat: "Course Notes", url: "https://refactoring.guru/design-patterns" },
  { title: "Compiler Design Lecture Notes", cat: "Course Notes", url: "https://www.geeksforgeeks.org/compiler-design-tutorials/" },
  { title: "Cloud Computing Fundamentals", cat: "Course Notes", url: "https://aws.amazon.com/getting-started/" },
  { title: "Data Science with R — Beginner Guide", cat: "Tutorial", url: "https://www.r-project.org/about.html" },
  { title: "Discrete Mathematics Notes", cat: "Course Notes", url: "https://www.geeksforgeeks.org/discrete-mathematics-tutorial/" },
  { title: "TypeScript Handbook", cat: "Reference", url: "https://www.typescriptlang.org/docs/handbook/" },
  { title: "Networking Lab Manual", cat: "Lab Material", url: "https://www.geeksforgeeks.org/computer-network-tutorials/" },
  { title: "Probability & Statistics for Engineering", cat: "Course Notes", url: "https://www.khanacademy.org/math/statistics-probability" },
  { title: "Docker & Containerization Guide", cat: "Tutorial", url: "https://docs.docker.com/get-started/" },
  { title: "REST API Design Best Practices", cat: "Reference", url: "https://restfulapi.net/" },
  { title: "Embedded Systems Introduction", cat: "Course Notes", url: "https://www.geeksforgeeks.org/embedded-systems/" },
  { title: "NLP Notes", cat: "Course Notes", url: "https://www.nltk.org/book/" },
  { title: "Computer Graphics Fundamentals", cat: "Course Notes", url: "https://www.geeksforgeeks.org/computer-graphics-2/" },
  { title: "Cryptography — Mathematical Foundations", cat: "Course Notes", url: "https://www.khanacademy.org/computing/computer-science/cryptography" },
  { title: "Node.js Backend Development Guide", cat: "Tutorial", url: "https://nodejs.org/en/learn" },
  { title: "Data Warehousing & Mining Concepts", cat: "Course Notes", url: "https://www.geeksforgeeks.org/data-warehousing/" },
  { title: "Agile & Scrum Framework Guide", cat: "Reference", url: "https://scrumguides.org/" },
  { title: "Theory of Computation Notes", cat: "Course Notes", url: "https://www.geeksforgeeks.org/theory-of-computation-automata-tutorials/" },
  { title: "Internet of Things Introduction", cat: "Course Notes", url: "https://www.geeksforgeeks.org/introduction-to-internet-of-things-iot-set-1/" },
  { title: "Digital Electronics Fundamentals", cat: "Course Notes", url: "https://www.geeksforgeeks.org/digital-electronics-logic-design-tutorials/" },
  { title: "System Design Interview Prep", cat: "Practice", url: "https://github.com/donnemartin/system-design-primer" },
  { title: "Mobile App Dev with React Native", cat: "Tutorial", url: "https://reactnative.dev/docs/getting-started" },
  { title: "Quantum Computing Basics", cat: "Course Notes", url: "https://qiskit.org/learn/" },
  { title: "Blockchain Technology Overview", cat: "Course Notes", url: "https://www.geeksforgeeks.org/blockchain-technology-introduction/" },
  { title: "Computer Architecture Notes", cat: "Course Notes", url: "https://www.geeksforgeeks.org/computer-organization-and-architecture-tutorials/" },
  { title: "UML Diagram Examples", cat: "Reference", url: "https://www.uml-diagrams.org/" },
  { title: "Big Data Analytics with Hadoop", cat: "Course Notes", url: "https://hadoop.apache.org/docs/stable/" },
  { title: "Ethics in Computing & AI", cat: "Course Notes", url: "https://www.acm.org/code-of-ethics" },
  { title: "Competitive Programming Resources", cat: "Practice", url: "https://codeforces.com/" },
  { title: "Final Year Project Guidelines", cat: "Guidelines", url: "https://www.ieee.org/publications/authors/author-templates.html" },
];

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log("╔═══════════════════════════════════════════════════════╗");
  console.log("║  LMS REALISTIC TEST DATA SEEDER                     ║");
  console.log("║  Seed: LMS_HUMAN_WORKFLOW_TEST_2026_08               ║");
  console.log("╚═══════════════════════════════════════════════════════╝\n");

  // PHASE 1: BASELINE
  console.log("━━━ PHASE 1: DATABASE BASELINE ━━━");
  const [preS, preC, preB, preE, preR, preRes] = await Promise.all([
    prisma.students.count(), prisma.colleges.count({ where: { isDeleted: { not: true } } }),
    prisma.batches.count(), prisma.exams.count({ where: { deletedAt: null } }),
    prisma.resources.count(), prisma.exam_results.count(),
  ]);
  console.log(`  Students: ${preS} | Colleges: ${preC} | Batches: ${preB}`);
  console.log(`  Exams: ${preE} | Resources: ${preR} | Results: ${preRes}`);

  const existSeedE = await prisma.exams.count({ where: { id: { startsWith: EXAM_PREFIX } } });
  const existSeedR = await prisma.resources.count({ where: { id: { startsWith: RESOURCE_PREFIX } } });
  console.log(`  Existing seed exams: ${existSeedE} | resources: ${existSeedR}\n`);

  const colleges = await prisma.colleges.findMany({
    where: { isDeleted: { not: true } }, select: { id: true, name: true, departments: true }, take: 30
  });

  // PHASE 2: EXAMS
  if (existSeedE < 50) {
    console.log("━━━ PHASE 2: CREATING 50 EXAMS ━━━");
    let created = 0;
    for (let i = 0; i < 50; i++) {
      const t = TEMPLATES[i];
      const id = `${EXAM_PREFIX}${String(i + 1).padStart(3, '0')}`;
      if (await prisma.exams.findUnique({ where: { id }, select: { id: true } })) continue;

      let status: string, startTime: Date | null = null, endTime: Date | null = null;
      if (i < 10) { status = "scheduled"; startTime = futureDate(randomInt(3, 30)); endTime = new Date(startTime.getTime() + randomInt(60, 180) * 60000); }
      else if (i < 15) { status = "active"; startTime = pastDate(randomInt(0, 1), 6); endTime = futureDate(randomInt(1, 5)); }
      else if (i < 40) { status = "completed"; startTime = pastDate(randomInt(5, 60)); endTime = new Date(startTime.getTime() + randomInt(60, 180) * 60000); }
      else { status = "expired"; startTime = pastDate(randomInt(30, 90)); endTime = new Date(startTime.getTime() + randomInt(60, 180) * 60000); }

      let targets: any[] = [], collegeId: string | null = null;
      if (i < 20) { targets = [{ type: "composite", collegeId: "", department: "", academicYear: "", section: "", batchId: "", ids: [] }]; }
      else {
        const col = colleges[(i - 20) % colleges.length];
        collegeId = col.id;
        const dept = col.departments?.length ? col.departments[randomInt(0, Math.min(2, col.departments.length - 1))] : "Computer Science";
        targets = [{ type: "composite", collegeId: col.id, collegeName: col.name, department: dept, academicYear: "", section: "", batchId: "", ids: [] }];
      }

      const qs = t.qFn();
      const selQs = pickRandom(qs, randomInt(10, Math.min(qs.length, 15)));
      const totalMarks = selQs.reduce((s, q) => s + q.marks, 0);

      await prisma.exams.create({ data: { id, title: t.title, description: t.desc, collegeId, durationMinutes: randomInt(30, 120), totalMarks, passingMarks: Math.ceil(totalMarks * 0.4), status, targets, settings: { shuffleQuestions: true, shuffleOptions: true, showResults: true, allowReview: true, autoSubmit: true, proctoring: false }, scheduledAt: startTime, startTime, endTime, createdAt: pastDate(randomInt(5, 90)) } as any });
      await prisma.questions.createMany({ data: selQs.map((q, idx) => ({ id: `q-${id}-${idx}`, examId: id, text: q.text, type: "mcq", options: q.options, correctAnswer: q.correctAnswer, marks: q.marks, explanation: q.explanation, subject: t.subject, topic: q.topic, difficulty: q.difficulty, sortOrder: idx })) });
      created++;
      if (created % 10 === 0) console.log(`  Created ${created}/50 exams...`);
    }
    console.log(`  ✅ Created ${created} exams with questions\n`);
  } else { console.log("━━━ PHASE 2: EXAMS EXIST (SKIP) ━━━\n"); }

  // PHASE 3: RESOURCES
  if (existSeedR < 50) {
    console.log("━━━ PHASE 3: CREATING 50 RESOURCES ━━━");
    let created = 0;
    for (let i = 0; i < 50; i++) {
      const t = RES_TEMPLATES[i];
      const id = `${RESOURCE_PREFIX}${String(i + 1).padStart(3, '0')}`;
      if (await prisma.resources.findUnique({ where: { id }, select: { id: true } })) continue;

      let targets: any[] = [], collegeId: string | null = null;
      if (i < 20) { targets = [{ type: "composite", collegeId: "", department: "", ids: [] }]; }
      else { const col = colleges[(i - 20) % colleges.length]; collegeId = col.id; targets = [{ type: "composite", collegeId: col.id, collegeName: col.name, department: "", ids: [] }]; }

      await prisma.resources.create({ data: { id, title: t.title, description: t.title, type: "link", url: t.url, category: t.cat, tags: [t.cat], targets, collegeId, createdAt: pastDate(randomInt(5, 60)) } as any });
      created++;
    }
    console.log(`  ✅ Created ${created} resources\n`);
  } else { console.log("━━━ PHASE 3: RESOURCES EXIST (SKIP) ━━━\n"); }

  // PHASE 4: STUDENT ACTIVITY
  console.log("━━━ PHASE 4: SIMULATING STUDENT ACTIVITY ━━━");
  const completableExams = await prisma.exams.findMany({
    where: { id: { startsWith: EXAM_PREFIX }, status: { in: ["completed", "expired"] } },
    include: { questions: { select: { id: true, correctAnswer: true, marks: true, options: true } } }
  });
  console.log(`  ${completableExams.length} completed/expired exams for simulation`);

  let totalAttempts = 0, totalPassed = 0, totalFailed = 0;

  for (const exam of completableExams) {
    const existR = await prisma.exam_results.count({ where: { examId: exam.id } });
    if (existR > 0) { totalAttempts += existR; console.log(`  ⏭ "${exam.title.slice(0, 40)}..." has ${existR} results`); continue; }
    if (!exam.questions?.length) continue;

    const targets = exam.targets as any[];
    const isGlobal = !targets?.length || targets.every((t: any) => !t.collegeId || t.collegeId === "" || t.collegeId === "all" || t.collegeId === "global");
    
    let eligible: { id: string }[];
    if (isGlobal) { eligible = await prisma.students.findMany({ select: { id: true }, take: MAX_ATTEMPTS_PER_EXAM * 2, orderBy: { createdAt: 'desc' } }); }
    else {
      const colIds = targets.filter((t: any) => t.collegeId && t.collegeId !== "" && t.collegeId !== "all").map((t: any) => t.collegeId);
      eligible = colIds.length ? await prisma.students.findMany({ where: { collegeId: { in: colIds } }, select: { id: true }, take: MAX_ATTEMPTS_PER_EXAM * 2 }) : [];
    }
    if (!eligible.length) { console.log(`  ⚠ No eligible students for "${exam.title.slice(0, 40)}..."`); continue; }

    const numAttempts = Math.min(Math.ceil(eligible.length * randomFloat(0.5, 0.7)), MAX_ATTEMPTS_PER_EXAM);
    const students = pickRandom(eligible, numAttempts);
    const totalExamMarks = exam.questions.reduce((s: number, q: any) => s + (q.marks || 1), 0);
    const examPassing = exam.passingMarks || Math.ceil(totalExamMarks * 0.4);
    const records: any[] = [];

    for (const stu of students) {
      const targetPct = generateScorePercentage();
      const answers: Record<string, number> = {};
      let correct = 0, incorrect = 0, score = 0;
      const unanswered = randomInt(0, Math.ceil(exam.questions.length * 0.15));
      const answered = pickRandom(exam.questions, exam.questions.length - unanswered);
      const targetCorrect = Math.round((targetPct / 100) * answered.length);

      for (let qi = 0; qi < answered.length; qi++) {
        const q = answered[qi];
        const ca = typeof q.correctAnswer === 'number' ? q.correctAnswer : 0;
        if (qi < targetCorrect) { answers[q.id] = ca; correct++; score += q.marks || 1; }
        else { let w; do { w = randomInt(0, 3); } while (w === ca && 4 > 1); answers[q.id] = w; incorrect++; }
      }

      const pct = totalExamMarks > 0 ? Math.round((score / totalExamMarks) * 10000) / 100 : 0;
      const passed = score >= examPassing;
      const eStart = exam.startTime ? new Date(exam.startTime).getTime() : pastDate(30).getTime();
      const eEnd = exam.endTime ? new Date(exam.endTime).getTime() : eStart + 7200000;
      const sStart = new Date(eStart + randomFloat(0, Math.min((eEnd - eStart) * 0.3, 1800000)));
      const timeTaken = Math.max(5, Math.round(randomFloat(0.3, 0.95) * (exam.durationMinutes || 60)));
      const submitted = new Date(sStart.getTime() + timeTaken * 60000);

      if (passed) totalPassed++; else totalFailed++;
      records.push({ examId: exam.id, studentId: stu.id, score, totalMarks: totalExamMarks, percentage: pct, passed, status: "submitted", correctCount: correct, incorrectCount: incorrect, answers, timeTakenMinutes: timeTaken, startTime: sStart, submittedAt: submitted, createdAt: submitted });
    }

    for (let b = 0; b < records.length; b += 100) {
      await prisma.exam_results.createMany({ data: records.slice(b, b + 100), skipDuplicates: true });
    }
    totalAttempts += records.length;
    console.log(`  ✅ "${exam.title.slice(0, 40)}..." → ${records.length} attempts`);
  }

  // Active exams: a few in_progress
  const actives = await prisma.exams.findMany({ where: { id: { startsWith: EXAM_PREFIX }, status: "active" }, include: { questions: { select: { id: true, correctAnswer: true, marks: true, options: true } } } });
  for (const exam of actives) {
    const existR = await prisma.exam_results.count({ where: { examId: exam.id } });
    if (existR > 0 || !exam.questions?.length) continue;
    const elig = await prisma.students.findMany({ select: { id: true }, take: 50, orderBy: { createdAt: 'desc' } });
    const sel = pickRandom(elig, Math.min(randomInt(5, 15), elig.length));
    const tm = exam.questions.reduce((s: number, q: any) => s + (q.marks || 1), 0);
    const recs = sel.map(s => {
      const ans: Record<string, number> = {};
      const aq = pickRandom(exam.questions, randomInt(1, Math.ceil(exam.questions.length * 0.5)));
      let sc = 0, cc = 0, ic = 0;
      for (const q of aq) { const ca = typeof q.correctAnswer === 'number' ? q.correctAnswer : 0; if (Math.random() > 0.4) { ans[q.id] = ca; sc += q.marks || 1; cc++; } else { let w; do { w = randomInt(0, 3); } while (w === ca); ans[q.id] = w; ic++; } }
      return { examId: exam.id, studentId: s.id, score: sc, totalMarks: tm, percentage: tm > 0 ? Math.round((sc / tm) * 100) : 0, status: "in_progress", correctCount: cc, incorrectCount: ic, answers: ans, startTime: pastDate(0, 2), createdAt: new Date() };
    });
    await prisma.exam_results.createMany({ data: recs, skipDuplicates: true });
    totalAttempts += recs.length;
    console.log(`  ✅ Active "${exam.title.slice(0, 40)}..." → ${recs.length} in-progress`);
  }

  console.log(`\n  Total: ${totalAttempts} attempts | Passed: ${totalPassed} | Failed: ${totalFailed}`);

  // PHASE 5: VERIFICATION
  console.log("\n━━━ PHASE 5: VERIFICATION ━━━");
  const [postS, postC, postB, postE, postR, postRes] = await Promise.all([
    prisma.students.count(), prisma.colleges.count({ where: { isDeleted: { not: true } } }),
    prisma.batches.count(), prisma.exams.count({ where: { deletedAt: null } }),
    prisma.resources.count(), prisma.exam_results.count(),
  ]);
  const [seedE, seedR, seedRes] = await Promise.all([
    prisma.exams.count({ where: { id: { startsWith: EXAM_PREFIX } } }),
    prisma.resources.count({ where: { id: { startsWith: RESOURCE_PREFIX } } }),
    prisma.exam_results.count({ where: { exams: { id: { startsWith: EXAM_PREFIX } } } }),
  ]);
  const [sched, act, comp, exp] = await Promise.all([
    prisma.exams.count({ where: { id: { startsWith: EXAM_PREFIX }, status: "scheduled" } }),
    prisma.exams.count({ where: { id: { startsWith: EXAM_PREFIX }, status: "active" } }),
    prisma.exams.count({ where: { id: { startsWith: EXAM_PREFIX }, status: "completed" } }),
    prisma.exams.count({ where: { id: { startsWith: EXAM_PREFIX }, status: "expired" } }),
  ]);
  const passC = await prisma.exam_results.count({ where: { exams: { id: { startsWith: EXAM_PREFIX } }, passed: true } });
  const failC = await prisma.exam_results.count({ where: { exams: { id: { startsWith: EXAM_PREFIX } }, passed: false } });
  const globalE = await prisma.exams.count({ where: { id: { startsWith: EXAM_PREFIX }, collegeId: null } });
  const globalR = await prisma.resources.count({ where: { id: { startsWith: RESOURCE_PREFIX }, collegeId: null } });

  const orphans = await prisma.$queryRaw<Array<{count: bigint}>>`SELECT COUNT(*) as count FROM exam_results er LEFT JOIN students s ON s.id=er."studentId" LEFT JOIN exams e ON e.id=er."examId" WHERE s.id IS NULL OR e.id IS NULL`;
  const oC = Number(orphans[0]?.count || 0);

  console.log(`
  ╔═══════════════════════════════════════════════════╗
  ║           FINAL VERIFICATION REPORT               ║
  ╠═══════════════════════════════════════════════════╣
  ║ EXISTING DATA                                     ║
  ║   Students:  ${postS} (was ${preS})
  ║   Colleges:  ${postC} (was ${preC})
  ║   Batches:   ${postB} (was ${preB})
  ╠═══════════════════════════════════════════════════╣
  ║ NEW EXAMS: ${seedE}                               
  ║   Global: ${globalE} | College-specific: ${seedE - globalE}
  ║   Scheduled: ${sched} | Active: ${act} | Completed: ${comp} | Expired: ${exp}
  ╠═══════════════════════════════════════════════════╣
  ║ NEW RESOURCES: ${seedR}                           
  ║   Global: ${globalR} | College-specific: ${seedR - globalR}
  ╠═══════════════════════════════════════════════════╣
  ║ STUDENT ACTIVITY                                  
  ║   Total attempts: ${seedRes}
  ║   Passed: ${passC} | Failed: ${failC}
  ╠═══════════════════════════════════════════════════╣
  ║ INTEGRITY                                         
  ║   Orphan records: ${oC === 0 ? '0 ✅' : oC + ' ❌'}
  ║   Students preserved: ${postS === preS ? 'YES ✅' : 'NO ❌'}
  ║   Colleges preserved: ${postC === preC ? 'YES ✅' : 'NO ❌'}
  ║   Batches preserved:  ${postB === preB ? 'YES ✅' : 'NO ❌'}
  ╚═══════════════════════════════════════════════════╝
  `);

  await prisma.$disconnect();
  await pool.end();
  console.log("✅ Seeding complete!");
}

main().catch(e => { console.error("SEED ERROR:", e); process.exit(1); });
