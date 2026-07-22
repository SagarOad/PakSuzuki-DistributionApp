using System.Linq.Expressions;
using Microsoft.EntityFrameworkCore;
using PakSuzuki.Domain.Common;
using PakSuzuki.Domain.Interfaces;

namespace PakSuzuki.Infrastructure.Persistence.Repositories;

public class Repository<T> : IRepository<T> where T : BaseEntity
{
    private readonly ApplicationDbContext _context;
    private readonly DbSet<T> _dbSet;

    public Repository(ApplicationDbContext context)
    {
        _context = context;
        _dbSet = context.Set<T>();
    }

    public async Task<T?> GetByIdAsync(Guid id, CancellationToken ct = default) => await _dbSet.FindAsync(new object?[] { id }, ct);

    public async Task<IReadOnlyList<T>> ListAsync(Expression<Func<T, bool>>? predicate = null, CancellationToken ct = default) =>
        predicate == null ? await _dbSet.ToListAsync(ct) : await _dbSet.Where(predicate).ToListAsync(ct);

    public IQueryable<T> Query() => _dbSet.AsQueryable();

    public async Task AddAsync(T entity, CancellationToken ct = default) => await _dbSet.AddAsync(entity, ct);

    public void Update(T entity) => _dbSet.Update(entity);

    public void Remove(T entity)
    {
        // AuditableEntity overrides EntityState.Deleted -> Modified + IsDeleted=true
        // inside ApplicationDbContext.SaveChangesAsync, so Remove() here is safe for both
        // soft-deletable and plain entities.
        _dbSet.Remove(entity);
    }
}

public class UnitOfWork : IUnitOfWork
{
    private readonly ApplicationDbContext _context;
    private readonly Dictionary<Type, object> _repositories = new();

    public UnitOfWork(ApplicationDbContext context) => _context = context;

    public IRepository<T> Repository<T>() where T : BaseEntity
    {
        var type = typeof(T);
        if (!_repositories.ContainsKey(type))
            _repositories[type] = new Repository<T>(_context);
        return (IRepository<T>)_repositories[type];
    }

    public Task<int> SaveChangesAsync(CancellationToken ct = default) => _context.SaveChangesAsync(ct);
}
